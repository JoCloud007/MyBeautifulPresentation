import { Template, MbptTemplateV2, TEMPLATE_SCHEMA_VERSION } from "@/app/types/template";

const REQUIRED_TEMPLATE_FIELDS: Array<keyof Template> = [
  "id",
  "name",
  "description",
  "category",
  "colors",
  "fonts",
  "defaultSlides",
];

function isValidTemplate(obj: unknown): obj is Template {
  if (typeof obj !== "object" || obj === null) return false;
  const t = obj as Record<string, unknown>;
  for (const field of REQUIRED_TEMPLATE_FIELDS) {
    if (!(field in t)) return false;
  }
  if (typeof t.colors !== "object" || t.colors === null) return false;
  const colors = t.colors as Record<string, unknown>;
  const colorKeys = ["background", "foreground", "accent", "secondary", "muted", "border"];
  for (const k of colorKeys) {
    if (typeof colors[k] !== "string") return false;
  }
  if (typeof t.fonts !== "object" || t.fonts === null) return false;
  const fonts = t.fonts as Record<string, unknown>;
  if (typeof fonts.heading !== "string" || typeof fonts.body !== "string") return false;
  if (!Array.isArray(t.defaultSlides)) return false;
  return true;
}

export function importTemplateFromJson(json: unknown): Template {
  if (typeof json === "string") {
    try {
      json = JSON.parse(json);
    } catch {
      throw new Error("Invalid JSON string");
    }
  }

  if (typeof json !== "object" || json === null) {
    throw new Error("Expected an object");
  }

  const obj = json as Record<string, unknown>;

  // Support both wrapped { version, template } and bare Template objects
  let templateObj: unknown = obj;
  if ("version" in obj && "template" in obj) {
    const version = String(obj.version);
    if (version !== TEMPLATE_SCHEMA_VERSION && !version.startsWith("2.")) {
      throw new Error(`Unsupported .mbpt.json version: ${version}. Expected ${TEMPLATE_SCHEMA_VERSION}`);
    }
    templateObj = obj.template;
  }

  if (!isValidTemplate(templateObj)) {
    throw new Error("Invalid template object: missing required fields");
  }

  return templateObj as Template;
}

export async function importTemplateFromZip(file: File): Promise<Template[]> {
  // Use the native DecompressionStream API when available, fallback to JSZip-like parsing
  const buffer = await file.arrayBuffer();
  const templates: Template[] = [];

  // Simple ZIP central-directory parser to find .mbpt.json entries
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Find End of Central Directory Record
  let eocdrOffset = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 0x05 && data[i + 3] === 0x06) {
      eocdrOffset = i;
      break;
    }
  }

  if (eocdrOffset === -1) {
    throw new Error("Invalid ZIP file: End of Central Directory not found");
  }

  const cdOffset = view.getUint32(eocdrOffset + 16, true);
  const cdSize = view.getUint32(eocdrOffset + 12, true);
  const numEntries = view.getUint16(eocdrOffset + 10, true);

  let offset = cdOffset;
  const entries: Array<{ name: string; offset: number; compressedSize: number; uncompressedSize: number; compression: number }> = [];

  for (let i = 0; i < numEntries; i++) {
    if (offset >= cdOffset + cdSize) break;
    const signature = view.getUint32(offset, true);
    if (signature !== 0x02014b50) break;
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const compression = view.getUint16(offset + 10, true);

    const nameBytes = data.slice(offset + 46, offset + 46 + nameLen);
    const name = new TextDecoder().decode(nameBytes);

    entries.push({ name, offset: localHeaderOffset, compressedSize, uncompressedSize, compression });
    offset += 46 + nameLen + extraLen + commentLen;
  }

  for (const entry of entries) {
    if (!entry.name.endsWith(".mbpt.json")) continue;

    const localSig = view.getUint32(entry.offset, true);
    if (localSig !== 0x04034b50) continue;
    const nameLen = view.getUint16(entry.offset + 26, true);
    const extraLen = view.getUint16(entry.offset + 28, true);
    const dataOffset = entry.offset + 30 + nameLen + extraLen;
    const fileData = data.slice(dataOffset, dataOffset + entry.compressedSize);

    let uncompressed: Uint8Array;
    if (entry.compression === 8) {
      // DEFLATE
      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();
      writer.write(fileData);
      writer.close();
      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
      uncompressed = new Uint8Array(totalLen);
      let pos = 0;
      for (const c of chunks) {
        uncompressed.set(c, pos);
        pos += c.length;
      }
    } else {
      uncompressed = fileData;
    }

    const text = new TextDecoder().decode(uncompressed);
    const tpl = importTemplateFromJson(text);
    templates.push(tpl);
  }

  if (templates.length === 0) {
    throw new Error("No .mbpt.json files found in the ZIP archive");
  }

  return templates;
}

export function exportTemplateToJson(template: Template): string {
  const payload: MbptTemplateV2 = {
    version: TEMPLATE_SCHEMA_VERSION,
    template,
  };
  return JSON.stringify(payload, null, 2);
}

export function getTemplateExportFilename(template: Template): string {
  const safeName = template.name.replace(/[^a-zA-Z0-9\-_]/g, "_").toLowerCase();
  return `${safeName}.mbpt.json`;
}
