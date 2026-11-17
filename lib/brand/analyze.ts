/**
 * Orchestrateur : fichiers de charte → `BrandTokens`.
 *
 * C'est le seul point d'entrée utilisé par l'API (`/api/brand/analyze`) et par
 * le CLI (`scripts/brand-import.mjs`). Il décide quel parseur appliquer, agrège
 * les candidats de toutes les sources, puis délègue l'attribution des rôles à
 * `inferBrandTokens`.
 *
 * Règle d'agrégation : les sources ne sont PAS hiérarchisées à l'aveugle. Un
 * PPTX reste la meilleure source (valeurs exactes du thème), donc ses candidats
 * sont boostés — mais un libellé explicite (`--color-primary`) gagne toujours,
 * quel que soit le fichier.
 */

import { parseBrandCss } from "@/lib/brand/parse/css";
import { parseBrandPptx } from "@/lib/brand/parse/pptxBrand";
import { parseBrandPdf } from "@/lib/brand/parse/pdfText";
import { sanitizeSvg } from "@/lib/brand/parse/svgSanitize";
import { inferBrandTokens } from "@/lib/brand/infer";
import { BRAND_LIMITS } from "@/lib/brand/limits";
import { normalizeHex } from "@/lib/brand/normalizeColor";
import {
  BrandColorCandidate,
  BrandIcon,
  BrandLogo,
  BrandParseError,
  BrandSource,
  BrandTokens,
  emptyBrandTokens,
} from "@/lib/brand/types";

export interface BrandInputFile {
  name: string;
  /** Contenu binaire déjà lu (ou texte pour un CSS). */
  data: ArrayBuffer | Uint8Array | string;
  /** MIME fourni par le navigateur, sert au tri quand l'extension manque. */
  mimeType?: string;
}

export type BrandFileKind = "css" | "pptx" | "pdf" | "svg" | "image" | "unknown";

/** Détermine le type d'un fichier par MIME puis par extension. */
export function classifyBrandFile(file: BrandInputFile): BrandFileKind {
  const mime = (file.mimeType ?? "").toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (mime.includes("text/css") || ext === "css") return "css";
  if (mime.includes("presentationml") || ext === "pptx" || ext === "potx") return "pptx";
  if (mime.includes("application/pdf") || ext === "pdf") return "pdf";
  if (mime.includes("image/svg") || ext === "svg") return "svg";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(ext)) return "image";
  return "unknown";
}

function toBytes(data: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof data === "string") return new TextEncoder().encode(data);
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function toText(data: ArrayBuffer | Uint8Array | string): string {
  if (typeof data === "string") return data;
  return new TextDecoder("utf-8").decode(toBytes(data));
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array | string): ArrayBuffer {
  if (typeof data === "string") return new TextEncoder().encode(data).buffer as ArrayBuffer;
  const bytes = toBytes(data);
  // Copie stricte : évite de partager le buffer d'un fichier déjà transféré.
  return bytes.slice().buffer as ArrayBuffer;
}

/**
 * Provenance à enregistrer pour un fichier.
 * Un SVG ou une image n'apporte pas de *token* (couleur/police) : il apporte un
 * asset. On le classe donc en `manual`, jamais en `css`/`pptx`.
 */
function kindToSource(kind: BrandFileKind): BrandSource {
  switch (kind) {
    case "css":
      return "css";
    case "pptx":
      return "pptx";
    case "pdf":
      return "pdf";
    case "svg":
    case "image":
      return "manual";
    default:
      return "manual";
  }
}

/** MIME → format de logo accepté par `TemplateLogo`. */
function imageFormat(kind: BrandFileKind, name: string): "svg" | "png" | "jpg" | null {
  if (kind === "svg") return "svg";
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "png") return "png";
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  return null;
}

function toDataUrl(bytes: Uint8Array, format: "svg" | "png" | "jpg"): string {
  const mime = format === "svg" ? "image/svg+xml" : `image/${format}`;
  // `btoa` est disponible en navigateur ET en Node 20 (global).
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return `data:${mime};base64,${btoa(binary)}`;
}

export interface AnalyzeBrandInput {
  files: BrandInputFile[];
  /** Nom de la charte (nom du client). */
  name?: string;
  /** Force le mode clair/sombre. */
  mode?: "light" | "dark";
}

export interface AnalyzeBrandResult {
  brand: BrandTokens;
  /** Détail par fichier, pour afficher « ce qui a été lu ». */
  perFile: Array<{ name: string; kind: BrandFileKind; notes: string[]; ok: boolean; error?: string }>;
}

/**
 * Analyse un lot de fichiers de charte.
 * Lève `BrandParseError` seulement si AUCUNE source n'est exploitable : un
 * fichier illisible isolé est signalé dans `perFile`, pas fatal.
 */
export async function analyzeBrand(input: AnalyzeBrandInput): Promise<AnalyzeBrandResult> {
  const files = input.files ?? [];
  if (files.length === 0) {
    throw new BrandParseError("Aucun fichier fourni.");
  }

  let totalBytes = 0;
  for (const file of files) {
    const size =
      typeof file.data === "string" ? file.data.length : toBytes(file.data).byteLength;
    totalBytes += size;
    if (size === 0) {
      throw new BrandParseError(`Le fichier ${file.name} est vide.`);
    }
    if (size > BRAND_LIMITS.maxFileBytes) {
      throw new BrandParseError(
        `${file.name} est trop volumineux (max ${(BRAND_LIMITS.maxFileBytes / 1024 / 1024).toFixed(0)} Mo).`
      );
    }
  }
  if (totalBytes > BRAND_LIMITS.maxTotalBytes) {
    throw new BrandParseError(
      `Total des fichiers trop volumineux (max ${(BRAND_LIMITS.maxTotalBytes / 1024 / 1024).toFixed(0)} Mo).`
    );
  }

  const brand = emptyBrandTokens(input.name ?? "Charte client");
  const candidates: BrandColorCandidate[] = [];
  const perFile: AnalyzeBrandResult["perFile"] = [];

  let headingFamily: { family: string; evidence: string } | undefined;
  let bodyFamily: { family: string; evidence: string } | undefined;
  let cssFamilies: Array<{ family: string; weight: number; evidence: string }> = [];

  for (const file of files) {
    const kind = classifyBrandFile(file);

    try {
      switch (kind) {
        case "css": {
          const parsed = parseBrandCss(toText(file.data), file.name);
          // Un CSS décrit explicitement la charte : ses candidats pèsent 1.5×.
          candidates.push(
            ...parsed.candidates.map((c) => ({ ...c, weight: c.weight * 1.5 }))
          );
          brand.fonts.faces.push(...parsed.faces);
          cssFamilies = cssFamilies.concat(parsed.families);
          perFile.push({ name: file.name, kind, notes: parsed.notes, ok: true });
          break;
        }

        case "pptx": {
          const parsed = await parseBrandPptx(toArrayBuffer(file.data));
          // Le thème Office donne des valeurs exactes : poids max.
          candidates.push(
            ...parsed.candidates.map((c) => ({ ...c, weight: c.weight * 2 }))
          );
          if (parsed.heading) headingFamily = { family: parsed.heading.family, evidence: parsed.heading.evidence };
          if (parsed.body) bodyFamily = { family: parsed.body.family, evidence: parsed.body.evidence };
          brand.logos.push(...parsed.logos);
          brand.fonts.faces.push(...parsed.faces);
          perFile.push({ name: file.name, kind, notes: parsed.notes, ok: true });
          break;
        }

        case "pdf": {
          const parsed = await parseBrandPdf(toArrayBuffer(file.data));
          candidates.push(...parsed.candidates);
          cssFamilies = cssFamilies.concat(parsed.families);
          perFile.push({ name: file.name, kind, notes: parsed.notes, ok: true });
          break;
        }

        case "svg": {
          const raw = toText(file.data);
          const safe = sanitizeSvg(raw);
          if (!safe) {
            perFile.push({
              name: file.name,
              kind,
              notes: [],
              ok: false,
              error: "SVG sans contenu vectoriel exploitable (ou entièrement filtré).",
            });
            break;
          }
          if (safe.length > BRAND_LIMITS.maxSvgBytes) {
            perFile.push({
              name: file.name,
              kind,
              notes: [],
              ok: false,
              error: "SVG trop volumineux.",
            });
            break;
          }
          const displayName = file.name.replace(/\.svg$/i, "");
          const icon: BrandIcon = {
            id: `svg-${brand.icons.length + 1}`,
            name: displayName,
            svg: safe,
            dataUrl: toDataUrl(new TextEncoder().encode(safe), "svg"),
          };
          if (brand.icons.length < BRAND_LIMITS.maxIcons) brand.icons.push(icon);
          // Un SVG peut aussi être le logo : on le propose dans les deux listes.
          if (brand.logos.length < BRAND_LIMITS.maxLogos) {
            brand.logos.push({
              id: `logo-${brand.logos.length + 1}`,
              name: file.name,
              dataUrl: icon.dataUrl,
              format: "svg",
              bytes: safe.length,
            });
          }
          perFile.push({
            name: file.name,
            kind,
            notes: [`SVG sanitizé (${safe.length} octets)`],
            ok: true,
          });
          break;
        }

        case "image": {
          const format = imageFormat(kind, file.name);
          if (!format) {
            perFile.push({
              name: file.name,
              kind,
              notes: [],
              ok: false,
              error: "Format d'image non pris en charge (utilisez SVG, PNG ou JPG).",
            });
            break;
          }
          const bytes = toBytes(file.data);
          const logo: BrandLogo = {
            id: `logo-${brand.logos.length + 1}`,
            name: file.name,
            dataUrl: toDataUrl(bytes, format),
            format,
            bytes: bytes.byteLength,
          };
          if (brand.logos.length < BRAND_LIMITS.maxLogos) brand.logos.push(logo);
          perFile.push({
            name: file.name,
            kind,
            notes: ["image retenue comme logo candidat"],
            ok: true,
          });
          break;
        }

        default: {
          perFile.push({
            name: file.name,
            kind,
            notes: [],
            ok: false,
            error: "Type de fichier non reconnu (attendu : CSS, PPTX, PDF, SVG, PNG, JPG).",
          });
        }
      }

      if (kind !== "unknown") {
        brand.sources.push({ kind: kindToSource(kind), name: file.name });
      }
    } catch (error) {
      perFile.push({
        name: file.name,
        kind,
        notes: [],
        ok: false,
        error: error instanceof Error ? error.message : "Erreur d'analyse inconnue.",
      });
    }
  }

  const successful = perFile.filter((p) => p.ok).length;
  if (successful === 0) {
    const details = perFile
      .map((p) => `• ${p.name} : ${p.error ?? "illisible"}`)
      .join("\n");
    throw new BrandParseError(
      `Aucun fichier exploitable.\n${details}`
    );
  }

  // Les polices d'un CSS ou d'un PDF sont agrégées ici : le thème PPTX a déjà
  // rempli les rôles, et un `@font-face` explicite précise la famille réelle.
  const topFamily = cssFamilies.sort((a, b) => b.weight - a.weight)[0];
  if (!headingFamily && topFamily) {
    headingFamily = { family: topFamily.family, evidence: topFamily.evidence };
  }
  if (!bodyFamily && cssFamilies.length > 1) {
    const second = cssFamilies[1];
    bodyFamily = { family: second.family, evidence: second.evidence };
  }

  const inferred = inferBrandTokens(candidates, {
    name: input.name ?? "Charte client",
    headingFamily,
    bodyFamily,
    mode: input.mode,
  });

  // Conserve les faces et pictogrammes collectés par les parseurs.
  inferred.fonts.faces = dedupeFaces([...inferred.fonts.faces, ...brand.fonts.faces]);
  inferred.icons = brand.icons.slice(0, BRAND_LIMITS.maxIcons);
  inferred.logos = brand.logos.slice(0, BRAND_LIMITS.maxLogos);
  inferred.sources = brand.sources;

  inferred.warnings.push(...perFile.filter((p) => !p.ok).map((p) => `${p.name} : ${p.error}`));

  return { brand: inferred, perFile };
}

/** Deux `@font-face` identiques (même famille/URL) ne doivent pas être chargés deux fois. */
function dedupeFaces<T extends { family: string; url?: string }>(faces: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const face of faces) {
    const key = `${face.family.toLowerCase()}|${face.url ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(face);
  }
  return out;
}

/** Réutilisé par l'API pour valider une couleur transmise par le client. */
export function coerceBrandHex(value: unknown): string | null {
  return typeof value === "string" ? normalizeHex(value) : null;
}
