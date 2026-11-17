/**
 * Extraction de charte depuis un PDF de guidelines.
 *
 * Un PDF n'a pas de structure de charte : on n'y lit que du TEXTE (codes
 * couleur, familles de polices, libellés) et on en déduit des candidats. C'est
 * volontairement de la lecture seule et sans heuristique de rôle — l'inférence
 * vit dans `lib/brand/infer.ts`, testable sans PDF.
 *
 * `unpdf` (PDF.js côté serveur, sans worker) est importé dynamiquement : il ne
 * doit jamais entrer dans le bundle client.
 */

import { BRAND_LIMITS } from "@/lib/brand/limits";
import {
  mergeSimilarColors,
  normalizeHex,
} from "@/lib/brand/normalizeColor";
import {
  BrandColorCandidate,
  BrandParseError,
} from "@/lib/brand/types";

export interface ParsedPdfBrand {
  candidates: BrandColorCandidate[];
  families: Array<{ family: string; weight: number; evidence: string }>;
  /** Texte brut, borné — utile pour l'assistance LLM et le diagnostic. */
  text: string;
  notes: string[];
}

/** Familles courantes : sert à reconnaître une police nommée sans `font-family:`. */
const KNOWN_FAMILIES = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Nunito",
  "Raleway",
  "Work Sans",
  "Source Sans Pro",
  "IBM Plex Sans",
  "IBM Plex Serif",
  "Fira Sans",
  "DM Sans",
  "Manrope",
  "Space Grotesk",
  "Barlow",
  "Rubik",
  "Karla",
  "Mulish",
  "Archivo",
  "Oswald",
  "Playfair Display",
  "Merriweather",
  "Lora",
  "Cormorant",
  "Libre Baskerville",
  "Crimson Text",
  "EB Garamond",
  "Source Serif Pro",
  "Noto Sans",
  "Noto Serif",
  "Helvetica",
  "Helvetica Neue",
  "Arial",
  "Georgia",
  "Times New Roman",
  "Garamond",
  "Futura",
  "Avenir",
  "Avenir Next",
  "Gill Sans",
  "Century Gothic",
  "Trebuchet MS",
  "Verdana",
  "Tahoma",
  "Calibri",
  "Cambria",
  "Segoe UI",
  "Univers",
  "Frutiger",
  "Myriad Pro",
  "DIN",
];

/** Mots voisins d'un code couleur qui en disent le rôle. */
const ROLE_KEYWORDS: Array<{ role: string; weight: number; re: RegExp }> = [
  { role: "primaire", weight: 9, re: /\b(primaire|primary|principale?|main)\b/i },
  { role: "accent", weight: 8, re: /\b(accent|accentuation|highlight|secondaire d'accent)\b/i },
  { role: "secondaire", weight: 6, re: /\b(secondaire|secondary|compl[eé]mentaire)\b/i },
  { role: "fond", weight: 5, re: /\b(fond|background|arri[eè]re[- ]plan|surface)\b/i },
  { role: "texte", weight: 5, re: /\b(texte|text|encre|ink|foreground|corps de texte)\b/i },
  { role: "neutre", weight: 3, re: /\b(neutre|neutral|gris|grey|gray|muted)\b/i },
  { role: "bordure", weight: 3, re: /\b(bordure|border|contour|stroke|filet)\b/i },
];

/**
 * Certains PDF écrivent les couleurs en hors-texte (un swatch graphique porte la
 * couleur, le texte ne porte que le nom). On ne peut pas les lire sans rendre la
 * page : on le signale plutôt que d'inventer une couleur.
 */
export async function parseBrandPdf(buffer: ArrayBuffer): Promise<ParsedPdfBrand> {
  if (!buffer || buffer.byteLength === 0) {
    throw new BrandParseError("Le fichier PDF est vide.");
  }
  if (buffer.byteLength > BRAND_LIMITS.maxFileBytes) {
    throw new BrandParseError(
      `PDF trop volumineux (max ${(BRAND_LIMITS.maxFileBytes / 1024 / 1024).toFixed(0)} Mo).`
    );
  }

  let text = "";
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const extracted = await extractText(pdf, { mergePages: true });
    text = Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text;
  } catch (error) {
    throw new BrandParseError(
      `PDF illisible (${error instanceof Error ? error.message : "erreur inconnue"}). ` +
        "S'il est protégé par mot de passe, retirez la protection puis réessayez."
    );
  }

  // Borne : un guide de 200 pages n'apporte rien de plus, et le texte intégral
  // partirait dans la réponse HTTP.
  const bounded = text.slice(0, 200_000);

  if (!bounded.trim()) {
    throw new BrandParseError(
      "Ce PDF ne contient aucune couche texte (document scanné ou exporté en image). " +
        "Utilisez plutôt le fichier CSS ou le PPTX de la charte, ou saisissez les couleurs à la main."
    );
  }

  return extractBrandFromText(bounded, "guidelines.pdf");
}

/**
 * Extraction pure à partir d'un texte — testable sans PDF.
 * C'est ici que se trouve toute la logique, `parseBrandPdf` ne fait que produire
 * le texte.
 */
export function extractBrandFromText(
  text: string,
  filename = "guidelines.pdf"
): ParsedPdfBrand {
  const candidates: BrandColorCandidate[] = [];
  const notes: string[] = [];

  // --- Couleurs : hex, rgb/hsl, et triplets RVB séparés par des virgules --
  const hexRe = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = hexRe.exec(text)) !== null) {
    const hex = normalizeHex(`#${m[1]}`);
    if (!hex) continue;
    candidates.push({
      hex,
      weight: 3 + roleWeightNear(text, m.index),
      evidence: `${m[0]} dans ${filename}`,
      source: "pdf",
    });
  }

  const fnRe = /(rgba?|hsla?)\([^)]{3,40}\)/gi;
  while ((m = fnRe.exec(text)) !== null) {
    const hex = normalizeHex(m[0]);
    if (!hex) continue;
    candidates.push({
      hex,
      weight: 2 + roleWeightNear(text, m.index),
      evidence: `${m[0]} dans ${filename}`,
      source: "pdf",
    });
  }

  // `R 30 V 64 B 175` / `RGB 30 64 175` / `30 / 64 / 175`
  const rgbTripletRe =
    /(?:R\s*[:=]?\s*(\d{1,3})\D{1,8}?V\s*[:=]?\s*(\d{1,3})\D{1,8}?B\s*[:=]?\s*(\d{1,3}))|(?:RGB\s*[:=]?\s*(\d{1,3})\D{1,4}(\d{1,3})\D{1,4}(\d{1,3}))|(?:\b(\d{1,3})\s*[\/,]\s*(\d{1,3})\s*[\/,]\s*(\d{1,3})\b)/gi;
  while ((m = rgbTripletRe.exec(text)) !== null) {
    const r = Number(m[1] ?? m[4] ?? m[7]);
    const g = Number(m[2] ?? m[5] ?? m[8]);
    const b = Number(m[3] ?? m[6] ?? m[9]);
    if ([r, g, b].some((v) => !Number.isFinite(v) || v > 255)) continue;
    const hex = normalizeHex(`rgb(${r}, ${g}, ${b})`);
    if (!hex) continue;
    candidates.push({
      hex,
      weight: 2 + roleWeightNear(text, m.index),
      evidence: `RVB ${r}/${g}/${b} dans ${filename}`,
      source: "pdf",
    });
  }

  const merged = mergeSimilarColors(candidates);
  if (merged.length > 0) notes.push(`${merged.length} couleur(s) distincte(s) trouvée(s)`);

  // --- Polices : noms connus + `font-family:` explicite -------------------
  const familyWeights = new Map<string, { weight: number; evidence: string }>();
  const bump = (family: string, evidence: string, weight: number) => {
    const existing = familyWeights.get(family);
    if (existing) {
      existing.weight += weight;
      if (!existing.evidence.includes(evidence)) {
        existing.evidence = `${existing.evidence} · ${evidence}`;
      }
    } else {
      familyWeights.set(family, { weight, evidence });
    }
  };

  for (const family of KNOWN_FAMILIES) {
    // Recherche insensible à la casse, sur mot entier.
    const escaped = family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^\\w-])${escaped}([^\\w-]|$)`, "gi");
    let count = 0;
    while (re.exec(text) !== null) {
      count++;
      if (count > 8) break;
    }
    if (count > 0) {
      bump(matchedCasing(text, family) ?? family, `nommée dans ${filename}`, count);
    }
  }

  const ffRe = /font-family\s*:\s*([^;\n]{2,80})/gi;
  while ((m = ffRe.exec(text)) !== null) {
    const first = m[1].split(",")[0]?.trim().replace(/["']/g, "");
    if (first && first.length <= 60) {
      bump(first, `font-family dans ${filename}`, 6);
    }
  }

  // --- Signalétique « titres / corps » ------------------------------------
  const headingHint = /(police\s+(?:des\s+)?titres?|heading|display|title font)/i.exec(text);
  const bodyHint = /(police\s+(?:du\s+)?(?:corps|texte)|body|copy font|texte courant)/i.exec(text);

  const families = [...familyWeights.entries()]
    .map(([family, v]) => ({ family, ...v }))
    .sort((a, b) => b.weight - a.weight);

  if (families.length > 0) notes.push(`${families.length} famille(s) détectée(s)`);
  if (headingHint) notes.push("mention explicite d'une police de titres");
  if (bodyHint) notes.push("mention explicite d'une police de corps");

  if (merged.length === 0 && families.length === 0) {
    throw new BrandParseError(
      `Aucune couleur ni police exploitable dans ${filename}. ` +
        "Le PDF est probablement une présentation commerciale et non une charte graphique."
    );
  }

  return { candidates: merged, families, text: boundedSlice(text), notes };
}

/** Poids supplémentaire si un mot de rôle se trouve juste avant la couleur. */
function roleWeightNear(text: string, index: number): number {
  const window = text.slice(Math.max(0, index - 80), index);
  let best = 0;
  for (const { weight, re } of ROLE_KEYWORDS) {
    if (re.test(window)) best = Math.max(best, weight);
  }
  return best;
}

/** Récupère la casse réelle du document (« Montserrat » vs « montserrat »). */
function matchedCasing(text: string, family: string): string | null {
  const escaped = family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = new RegExp(`(^|[^\\w-])(${escaped})([^\\w-]|$)`, "i").exec(text);
  return found?.[2] ?? null;
}

function boundedSlice(text: string): string {
  return text.length > 20_000 ? `${text.slice(0, 20_000)}\n…` : text;
}
