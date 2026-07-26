import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { Presentation, Slide, SlideLayout } from "@/app/types/presentation";

interface ParsedSlide {
  title: string;
  content: string;
  layout: SlideLayout;
  notes: string;
}

// ZIP bomb protection limits
const MAX_TOTAL_UNCOMPRESSED_SIZE = 100 * 1024 * 1024; // 100 MB
const MAX_ENTRY_COUNT = 1000;
const MAX_COMPRESSION_RATIO = 100; // 100:1

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Recursively extract all text from an OOXML node tree.
 * Handles nested a:p, a:r, a:t structures at any depth.
 */
function extractTextFromNode(node: unknown): string {
  if (typeof node === "string") {
    return node;
  }
  if (typeof node !== "object" || node === null) {
    return "";
  }

  const obj = node as Record<string, unknown>;

  // Direct text element
  if (obj["a:t"] !== undefined) {
    return String(obj["a:t"]);
  }

  // Paragraph or run — recurse and join children
  const parts: string[] = [];
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        const text = extractTextFromNode(item);
        if (text) parts.push(text);
      }
    } else {
      const text = extractTextFromNode(val);
      if (text) parts.push(text);
    }
  }

  // If this node itself represents a paragraph container, join with newlines
  if (obj["a:p"] !== undefined && parts.length > 0) {
    return parts.join("\n");
  }

  return parts.join("");
}

/**
 * Extract paragraphs from a text body, preserving structure.
 * Returns array of { text, level } for bullet support.
 */
function extractParagraphs(node: unknown): Array<{ text: string; level: number }> {
  if (typeof node !== "object" || node === null) {
    return [];
  }
  const obj = node as Record<string, unknown>;

  if (obj["a:p"] !== undefined) {
    const paragraphs = Array.isArray(obj["a:p"]) ? obj["a:p"] : [obj["a:p"]];
    return paragraphs.flatMap((p) => extractParagraphs(p));
  }

  // Single paragraph node
  const pObj = obj;
  let level = 0;
  if (pObj["a:pPr"] && typeof pObj["a:pPr"] === "object") {
    const pPr = pObj["a:pPr"] as Record<string, unknown>;
    if (pPr["@_lvl"] !== undefined) {
      level = parseInt(String(pPr["@_lvl"]), 10) || 0;
    }
    if (pPr["a:lvl"] !== undefined) {
      level = parseInt(String(pPr["a:lvl"]), 10) || 0;
    }
  }

  const text = extractTextFromNode(node);
  if (!text.trim()) return [];
  return [{ text: text.trim(), level }];
}

/**
 * Parse a single slide XML into title, content, layout.
 */
function parseSlideXml(xmlContent: string): Omit<ParsedSlide, "notes"> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    processEntities: false,
  });

  const parsed = parser.parse(xmlContent);
  const spTree = parsed?.["p:sld"]?.["p:cSld"]?.["p:spTree"];

  if (!spTree) {
    return { title: "", content: "", layout: "content-only" };
  }

  const shapes = spTree["p:sp"];
  const pics = spTree["p:pic"];
  const shapeArray = shapes
    ? Array.isArray(shapes)
      ? shapes
      : [shapes]
    : [];
  const picArray = pics
    ? Array.isArray(pics)
      ? pics
      : [pics]
    : [];

  let title = "";
  let subtitle = "";
  const bodyTexts: string[] = [];
  let hasTitle = false;
  let hasBody = false;
  const bodyFrames: string[] = [];

  for (const shape of shapeArray) {
    const placeholder = shape["p:nvSpPr"]?.["p:nvPr"]?.["p:ph"];
    const textBody = shape["p:txBody"];
    if (!textBody) continue;

    const paragraphs = extractParagraphs(textBody);
    const bulletText = paragraphs.map((p) => {
      const indent = "  ".repeat(p.level);
      const bullet = p.level > 0 ? "- " : "• ";
      return indent + bullet + p.text;
    }).join("\n");

    if (!bulletText.trim()) continue;

    if (placeholder) {
      const type = placeholder["@_type"];
      if (type === "title" || type === "ctrTitle") {
        // Titles should not have bullets
        title = extractTextFromNode(textBody).trim();
        hasTitle = true;
      } else if (type === "subTitle") {
        // Subtitles should not have bullets
        subtitle = extractTextFromNode(textBody).trim();
      } else if (type === "body" || type === "obj") {
        bodyFrames.push(bulletText);
        hasBody = true;
      } else {
        // Other placeholder types — treat as body
        bodyFrames.push(bulletText);
        hasBody = true;
      }
    } else {
      // Non-placeholder text shape
      const plainText = extractTextFromNode(textBody).trim();
      if (plainText) {
        bodyFrames.push(plainText);
        hasBody = true;
      }
    }
  }

  // Merge body frames
  bodyTexts.push(...bodyFrames);
  let content = bodyTexts.join("\n\n");

  // If subtitle exists and no body, use subtitle as content
  if (subtitle && !content) {
    content = "• " + subtitle;
    hasBody = true;
  }

  // Layout detection
  let layout: SlideLayout = "title-content";

  if (hasTitle && !hasBody && !subtitle) {
    layout = "title-only";
  } else if (!hasTitle && hasBody) {
    layout = "content-only";
  } else if (hasTitle && hasBody) {
    // Check for two-column heuristic: two distinct body frames
    if (bodyFrames.length >= 2) {
      layout = "two-column";
      content = bodyFrames.slice(0, 2).join("\n|\n");
    } else {
      layout = "title-content";
    }
  } else if (!hasTitle && !hasBody && subtitle) {
    layout = "content-only";
    content = subtitle;
  }

  // Image detection
  if (picArray.length > 0) {
    // If there are images, try to determine left/right based on first shape position
    const firstPic = picArray[0];
    const xfrm = firstPic?.["p:spPr"]?.["a:xfrm"];
    const off = xfrm?.["a:off"];
    const x = off?.["@_x"] ? parseInt(String(off["@_x"]), 10) : 0;

    if (hasTitle || hasBody) {
      // Image + text layouts
      layout = x < 3500000 ? "image-left" : "image-right";
    }
  }

  return {
    title: title || "Slide",
    content,
    layout,
  };
}

/**
 * Extract notes for a slide by resolving relationships.
 */
async function extractSlideNotes(
  zip: JSZip,
  slideFile: string
): Promise<string> {
  const slideName = slideFile.split('/').pop() ?? '';
  const slideRelsPath = `ppt/slides/_rels/${slideName}.rels`;

  const slideRelsXml = await zip.file(slideRelsPath)?.async("text");
  if (!slideRelsXml) return "";

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: false,
  });

  const slideRels = parser.parse(slideRelsXml);
  const relationships = slideRels?.["Relationships"]?.["Relationship"];
  const relArray = Array.isArray(relationships)
    ? relationships
    : relationships
    ? [relationships]
    : [];

  const notesRel = relArray.find(
    (r: Record<string, string>) => r["@_Type"]?.includes("/notesSlide")
  );
  if (!notesRel) return "";

  const notesPath = `ppt/${notesRel["@_Target"].replace(/^\.\.\//, "")}`;
  const notesXml = await zip.file(notesPath)?.async("text");
  if (!notesXml) return "";

  const notesParsed = parser.parse(notesXml);
  const notesSpTree = notesParsed?.["p:notes"]?.["p:cSld"]?.["p:spTree"];
  if (!notesSpTree) return "";

  const notesShapes = notesSpTree["p:sp"];
  const notesShapeArray = notesShapes
    ? Array.isArray(notesShapes)
      ? notesShapes
      : [notesShapes]
    : [];

  for (const shape of notesShapeArray) {
    const placeholder = shape["p:nvSpPr"]?.["p:nvPr"]?.["p:ph"];
    if (placeholder && placeholder["@_type"] === "body") {
      const textBody = shape["p:txBody"];
      if (!textBody) continue;
      const text = extractTextFromNode(textBody).trim();
      if (text) return text;
    }
  }

  // Fallback: any text in notes slide
  for (const shape of notesShapeArray) {
    const textBody = shape["p:txBody"];
    if (!textBody) continue;
    const text = extractTextFromNode(textBody).trim();
    if (text) return text;
  }

  return "";
}

function isValidPptxMimeType(file: File): boolean {
  // PPTX files are ZIP archives with specific MIME types
  const validTypes = [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/octet-stream",
  ];
  return validTypes.includes(file.type);
}

export async function importPPTX(file: File): Promise<Presentation> {
  // Basic MIME type validation (can be bypassed but provides first-line defense)
  if (!isValidPptxMimeType(file)) {
    // Also check magic number via array buffer
    const header = await file.slice(0, 4).arrayBuffer();
    const view = new Uint8Array(header);
    // ZIP magic number: PK\x03\x04 or PK\x05\x06 or PK\x07\x08
    const isZip = view[0] === 0x50 && view[1] === 0x4B && (view[2] === 0x03 || view[2] === 0x05 || view[2] === 0x07);
    if (!isZip) {
      throw new Error("Le fichier n'est pas un fichier ZIP/PPTX valide");
    }
  }

  const zip = await JSZip.loadAsync(file);

  // ZIP bomb protection: check entry count
  const entries = Object.keys(zip.files);
  if (entries.length > MAX_ENTRY_COUNT) {
    throw new Error(`Fichier PPTX trop complexe : ${entries.length} entrées (maximum ${MAX_ENTRY_COUNT})`);
  }

  // ZIP bomb protection: estimate uncompressed size using internal JSZip data
  let totalUncompressed = 0;
  let totalCompressed = 0;
  for (const entry of entries) {
    const fileEntry = zip.files[entry] as unknown as {
      dir: boolean;
      _data?: { uncompressedSize?: number; compressedSize?: number };
    };
    if (!fileEntry.dir) {
      totalUncompressed +=
        fileEntry._data?.uncompressedSize ||
        fileEntry._data?.compressedSize ||
        0;
      totalCompressed += fileEntry._data?.compressedSize || 1;
    }
  }

  if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_SIZE) {
    throw new Error(
      `Fichier PPTX trop volumineux décompressé (${(
        totalUncompressed /
        1024 /
        1024
      ).toFixed(1)} MB)`
    );
  }

  const compressionRatio =
    totalCompressed > 0 ? totalUncompressed / totalCompressed : 1;
  if (
    compressionRatio > MAX_COMPRESSION_RATIO &&
    totalUncompressed > 1024 * 1024
  ) {
    throw new Error(
      "Fichier PPTX suspect (taux de compression anormalement élevé)"
    );
  }

  // Read presentation.xml to get slide order
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  if (!presentationXml) {
    throw new Error("Fichier PPTX invalide : presentation.xml introuvable");
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: false,
  });

  const presParsed = parser.parse(presentationXml);
  const sldIdLst = presParsed?.["p:presentation"]?.["p:sldIdLst"]?.["p:sldId"];
  const slideIds = Array.isArray(sldIdLst)
    ? sldIdLst
    : sldIdLst
    ? [sldIdLst]
    : [];

  if (slideIds.length === 0) {
    throw new Error("Aucune slide trouvée dans le fichier PPTX");
  }

  // Map rId to slide file
  const relsXml = await zip.file("ppt/_rels/presentation.xml.rels")?.async("text");
  if (!relsXml) {
    throw new Error("Fichier PPTX invalide : relations introuvables");
  }

  const relsParsed = parser.parse(relsXml);
  const relationships = relsParsed?.["Relationships"]?.["Relationship"];
  const relArray = Array.isArray(relationships)
    ? relationships
    : relationships
    ? [relationships]
    : [];

  const slideFiles: string[] = [];
  for (const slideId of slideIds) {
    const rId = slideId["@_r:id"];
    const rel = relArray.find(
      (r: Record<string, string>) => r["@_Id"] === rId
    );
    if (rel) {
      slideFiles.push(`ppt/${rel["@_Target"]}`);
    }
  }

  // Parse each slide
  const slides: Slide[] = [];
  const missingSlides: string[] = [];
  for (const slideFile of slideFiles) {
    const slideXml = await zip.file(slideFile)?.async("text");
    if (!slideXml) {
      missingSlides.push(slideFile);
      continue;
    }

    const parsed = parseSlideXml(slideXml);
    const notes = await extractSlideNotes(zip, slideFile);

    slides.push({
      id: generateUUID(),
      title: parsed.title || "Slide",
      content: parsed.content || "",
      layout: parsed.layout,
      notes: notes || undefined,
    });
  }

  if (missingSlides.length > 0) {
    console.warn(`PPTX import: ${missingSlides.length} slide(s) manquante(s):`, missingSlides);
  }

  if (slides.length === 0) {
    throw new Error("Impossible d'extraire les slides du fichier PPTX");
  }

  return {
    id: generateUUID(),
    title: file.name.replace(/\.pptx$/i, ""),
    subtitle: "",
    author: "",
    slides,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
