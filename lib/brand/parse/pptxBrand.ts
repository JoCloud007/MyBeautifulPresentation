/**
 * Parseur de charte depuis un PPTX (thème Office + médias).
 *
 * Un `.pptx` est une archive ZIP. Le fichier qui porte réellement la charte est
 * `ppt/theme/theme1.xml` : `a:clrScheme` donne les 6 accents + 4 fonds/textes,
 * `a:fontScheme` donne les polices majeure/mineure. C'est la source la plus
 * fiable quand le client fournit un modèle de présentation — meilleure qu'un
 * PDF, puisque les valeurs y sont exactes et non arrondies par le rendu.
 *
 * Volontairement séparé de `lib/pptxImport.ts` : celui-ci importe une
 * *présentation* (slides), celui-là n'extrait qu'une *charte*. Les garde-fous
 * zip-bomb sont communs (`lib/brand/limits.ts`).
 */

import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { normalizeHex } from "@/lib/brand/normalizeColor";
import { BRAND_LIMITS } from "@/lib/brand/limits";
import {
  BrandColorCandidate,
  BrandFontFace,
  BrandLogo,
  BrandParseError,
} from "@/lib/brand/types";

export interface ParsedPptxBrand {
  candidates: BrandColorCandidate[];
  heading?: { family: string; evidence: string };
  body?: { family: string; evidence: string };
  faces: BrandFontFace[];
  logos: BrandLogo[];
  notes: string[];
}

const MEDIA_MIME: Record<string, "png" | "jpg" | "svg"> = {
  png: "png",
  jpg: "jpg",
  jpeg: "jpg",
  svg: "svg",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false,
  isArray: (name) => name === "a:accent1" || name === "a:accent2",
});

/**
 * Lit une couleur de `clrScheme` : soit `a:srgbClr/@val`, soit `a:sysClr/@lastClr`
 * (les thèmes Windows utilisent sysClr pour dk1/lt1).
 */
function schemeColorHex(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  const srgb = record["a:srgbClr"] as Record<string, unknown> | undefined;
  const srgbVal = srgb?.["@_val"];
  if (typeof srgbVal === "string") return normalizeHex(`#${srgbVal}`);
  const sys = record["a:sysClr"] as Record<string, unknown> | undefined;
  const sysLast = sys?.["@_lastClr"];
  if (typeof sysLast === "string") return normalizeHex(`#${sysLast}`);
  return null;
}

/** Poids d'un slot du thème : les accents portent l'identité, dk/lt le fond. */
const SLOT_WEIGHT: Record<string, number> = {
  accent1: 8,
  accent2: 7,
  accent3: 5,
  accent4: 4,
  accent5: 3,
  accent6: 2,
  dk2: 3,
  lt2: 3,
  dk1: 4,
  lt1: 4,
  hlink: 1,
  folHlink: 1,
};

export async function parseBrandPptx(file: File | ArrayBuffer): Promise<ParsedPptxBrand> {
  const buffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new BrandParseError("Le fichier PPTX est vide.");
  }
  if (buffer.byteLength > BRAND_LIMITS.maxFileBytes) {
    throw new BrandParseError(
      `Fichier PPTX trop volumineux (${(buffer.byteLength / 1024 / 1024).toFixed(0)} Mo, max ${(
        BRAND_LIMITS.maxFileBytes /
        1024 /
        1024
      ).toFixed(0)} Mo).`
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new BrandParseError(
      "Le fichier n'est pas un PPTX valide (archive ZIP illisible)."
    );
  }

  const entries = Object.keys(zip.files);
  if (entries.length > BRAND_LIMITS.maxZipEntries) {
    throw new BrandParseError(
      `PPTX trop complexe : ${entries.length} entrées (max ${BRAND_LIMITS.maxZipEntries}).`
    );
  }

  const candidates: BrandColorCandidate[] = [];
  const logos: BrandLogo[] = [];
  const notes: string[] = [];
  let heading: ParsedPptxBrand["heading"];
  let body: ParsedPptxBrand["body"];

  // --- 1. Thème : la source canonique -------------------------------------
  const themePath = entries.find((name) => /^ppt\/theme\/theme\d*\.xml$/.test(name));
  if (!themePath) {
    throw new BrandParseError(
      "Pas de thème Office dans ce PPTX (ppt/theme/theme1.xml absent). " +
        "Le fichier a-t-il bien été enregistré depuis PowerPoint/Keynote/Impress ?"
    );
  }

  const themeXml = await zip.file(themePath)!.async("text");
  const theme = parser.parse(themeXml);
  const themeElements =
    theme?.["a:theme"]?.["a:themeElements"] ?? theme?.["theme"]?.["themeElements"];

  const clrScheme =
    themeElements?.["a:clrScheme"] ?? themeElements?.["clrScheme"];
  if (clrScheme && typeof clrScheme === "object") {
    for (const [slot, weight] of Object.entries(SLOT_WEIGHT)) {
      const node =
        (clrScheme as Record<string, unknown>)[`a:${slot}`] ??
        (clrScheme as Record<string, unknown>)[slot];
      const hex = schemeColorHex(node);
      if (!hex) continue;
      candidates.push({
        hex,
        weight,
        evidence: `${slot} du thème PPTX`,
        source: "pptx",
      });
    }
    if (candidates.length > 0) {
      notes.push(`thème Office lu (${candidates.length} couleurs de schéma)`);
    }
  }

  const fontScheme =
    themeElements?.["a:fontScheme"] ?? themeElements?.["fontScheme"];
  if (fontScheme && typeof fontScheme === "object") {
    const fs = fontScheme as Record<string, unknown>;
    const major = fs["a:majorFont"] ?? fs["majorFont"];
    const minor = fs["a:minorFont"] ?? fs["minorFont"];
    const majorLatin = (major as Record<string, unknown> | undefined)?.["a:latin"] as
      | Record<string, unknown>
      | undefined;
    const minorLatin = (minor as Record<string, unknown> | undefined)?.["a:latin"] as
      | Record<string, unknown>
      | undefined;
    // `+mn-lt` / `+mj-lt` = polices de thème non résolues : inutilisable.
    const clean = (value: unknown): string | undefined => {
      if (typeof value !== "string") return undefined;
      const v = value.trim();
      if (!v || v.startsWith("+")) return undefined;
      return v;
    };
    const majorFamily = clean(majorLatin?.["@_typeface"]);
    const minorFamily = clean(minorLatin?.["@_typeface"]);
    if (majorFamily) {
      heading = { family: majorFamily, evidence: "police majeure du thème PPTX" };
    }
    if (minorFamily) {
      body = { family: minorFamily, evidence: "police mineure du thème PPTX" };
    }
    if (majorFamily || minorFamily) notes.push("polices du thème lues");
  }

  // --- 2. Master : filet de sécurité si le thème est partiel --------------
  if (!heading) {
    const masterXml = await zip
      .file("ppt/slideMasters/slideMaster1.xml")
      ?.async("text");
    if (masterXml) {
      const master = parser.parse(masterXml);
      const titleRPr =
        master?.["p:sldMaster"]?.["p:txStyles"]?.["p:titleStyle"]?.["a:lvl1pPr"]?.["a:defRPr"];
      const typeface = titleRPr?.["a:latin"]?.["@_typeface"];
      if (typeof typeface === "string" && !typeface.startsWith("+")) {
        heading = { family: typeface, evidence: "style de titre du master" };
      }
    }
  }

  // --- 3. Médias : candidats logo ----------------------------------------
  const mediaFiles = entries
    .filter((name) => /^ppt\/media\/[^/]+\.(png|jpe?g|svg)$/i.test(name))
    .map((name) => ({
      name,
      bytes: (zip.file(name) as unknown as { _data?: { uncompressedSize?: number } })?._data
        ?.uncompressedSize,
    }));

  // Les logos de charte sont petits et souvent nommés `logo*` / `image1`.
  // On trie par taille croissante bornée : un logo est rarement la plus grosse
  // image d'un deck (ça, c'est une photo de couverture).
  const sortedMedia = mediaFiles
    .filter((m) => (m.bytes ?? 0) > 0 && (m.bytes ?? 0) <= 2 * 1024 * 1024)
    .sort((a, b) => (a.bytes ?? 0) - (b.bytes ?? 0));

  for (const media of sortedMedia.slice(0, BRAND_LIMITS.maxLogos)) {
    const ext = media.name.split(".").pop()!.toLowerCase().replace("jpeg", "jpg");
    const format = MEDIA_MIME[ext];
    if (!format) continue;
    const data = await zip.file(media.name)!.async("base64");
    const mime = format === "svg" ? "image/svg+xml" : `image/${format}`;
    logos.push({
      id: media.name,
      name: media.name.split("/").pop() ?? media.name,
      dataUrl: `data:${mime};base64,${data}`,
      format,
      bytes: media.bytes ?? 0,
    });
  }
  if (logos.length > 0) notes.push(`${logos.length} image(s) candidate(s) logo`);

  if (candidates.length === 0 && !heading && !body) {
    throw new BrandParseError(
      "Aucune couleur ni police exploitable dans le thème de ce PPTX."
    );
  }

  return {
    candidates,
    heading,
    body,
    faces: [],
    logos,
    notes,
  };
}
