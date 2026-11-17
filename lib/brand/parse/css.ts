/**
 * Parseur de charte CSS → candidats de tokens de marque.
 *
 * Cible : ce qu'un client livre réellement — un `brand.css`, un export de
 * design tokens, ou un bout de `:root` copié depuis son site. Aucune
 * dépendance : un tokenizer minimal suffit et évite d'embarquer PostCSS dans
 * le bundle client.
 *
 * Ce module ne choisit PAS les rôles : il produit des candidats pondérés
 * (`colorCandidates`) et les polices déclarées. `lib/brand/infer.ts` décide.
 */

import {
  mergeSimilarColors,
  normalizeHex,
} from "@/lib/brand/normalizeColor";
import {
  BrandColorCandidate,
  BrandFontFace,
  BrandParseError,
} from "@/lib/brand/types";

export interface ParsedCss {
  candidates: BrandColorCandidate[];
  faces: BrandFontFace[];
  /** Familles vues dans `font-family`, par ordre d'apparition. */
  families: Array<{ family: string; weight: number; evidence: string }>;
  /** Notes lisibles : « 14 variables de couleur, 2 @font-face ». */
  notes: string[];
}

/** Mots-clés de nom de variable qui trahissent une couleur de charte. */
const COLOR_NAME_HINTS = [
  "color",
  "colour",
  "primary",
  "second",
  "accent",
  "brand",
  "bg",
  "background",
  "surface",
  "foreground",
  "text",
  "ink",
  "border",
  "muted",
  "neutral",
  "grey",
  "gray",
  "success",
  "warning",
  "danger",
  "error",
  "info",
];

/** Suffixes de taille qui ne sont pas des couleurs malgré le nom. */
const NON_COLOR_SUFFIX = /-(size|width|height|radius|spacing|space|gap|leading|tracking|line-height|scale|z|order|duration|delay|opacity|font-weight)\b/;

function looksLikeColorName(name: string): boolean {
  const n = name.toLowerCase();
  if (NON_COLOR_SUFFIX.test(n)) return false;
  return COLOR_NAME_HINTS.some((hint) => n.includes(hint));
}

/** Poids d'une variable selon la force de son nom. */
function nameWeight(name: string): number {
  const n = name.toLowerCase();
  if (/(^|[-_])primary($|[-_])/.test(n)) return 6;
  if (/(^|[-_])accent($|[-_])/.test(n)) return 5;
  if (/(^|[-_])secondary($|[-_])/.test(n)) return 4;
  if (/(^|[-_])brand($|[-_])/.test(n)) return 5;
  if (/(background|surface)/.test(n)) return 3;
  if (/(foreground|ink|text)/.test(n)) return 3;
  return 2;
}

/**
 * Analyse un document CSS. Tolérant par construction : un bloc illisible est
 * ignoré, jamais fatal — une charte client contient toujours du bruit.
 */
export function parseBrandCss(text: string, filename = "brand.css"): ParsedCss {
  if (typeof text !== "string" || !text.trim()) {
    throw new BrandParseError(`Le fichier ${filename} est vide.`);
  }

  // Retire les commentaires CSS sans casser les valeurs (`url(/*…)`).
  const css = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const candidates: BrandColorCandidate[] = [];
  const faces: BrandFontFace[] = [];
  const familyWeights = new Map<string, { weight: number; evidence: string }>();

  // 1. Variables CSS : la source la plus fiable d'une charte.
  const varRe = /(--[\w-]+)\s*:\s*([^;}]+)[;}]/g;
  let varCount = 0;
  let m: RegExpExecArray | null;
  while ((m = varRe.exec(css)) !== null) {
    const [, name, rawValue] = m;
    const value = rawValue.trim();
    if (looksLikeColorName(name)) {
      const hex = normalizeHex(value);
      if (hex) {
        varCount++;
        candidates.push({
          hex,
          weight: nameWeight(name) * 2,
          evidence: `${name} dans ${filename}`,
          source: "css",
        });
        continue;
      }
    }
    // Une variable peut aussi porter une famille de polices.
    if (/font/i.test(name)) {
      addFamilies(value, `variable ${name}`, familyWeights);
    }
  }

  // 2. @font-face : familles + sources de fichiers.
  const fontFaceRe = /@font-face\s*\{([^}]*)\}/gi;
  let faceCount = 0;
  while ((m = fontFaceRe.exec(css)) !== null) {
    const body = m[1];
    const family = body.match(/font-family\s*:\s*([^;}]+)/i)?.[1]?.trim();
    const src = body.match(/src\s*:\s*([^;}]+)/i)?.[1]?.trim();
    const weight = body.match(/font-weight\s*:\s*([^;}]+)/i)?.[1]?.trim();
    const style = body.match(/font-style\s*:\s*([^;}]+)/i)?.[1]?.trim();
    if (!family) continue;
    faceCount++;
    const cleanFamily = stripQuotes(family);
    addFamily(cleanFamily, `@font-face dans ${filename}`, familyWeights, 6);
    if (src) {
      const url = src.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i)?.[1];
      if (url) {
        faces.push({
          family: cleanFamily,
          url: url.trim(),
          weight: weight ? stripQuotes(weight) : undefined,
          style: style ? stripQuotes(style) : undefined,
        });
      }
    }
  }

  // 3. `font-family` hors @font-face : le corps et les titres.
  const declRe = /font-family\s*:\s*([^;}]+)/gi;
  while ((m = declRe.exec(css)) !== null) {
    addFamilies(m[1], `font-family dans ${filename}`, familyWeights);
  }

  // 4. Couleurs en dur : chaque hex/rgb du document est un candidat faible.
  const hexRe = /#([0-9a-f]{3,8})\b/gi;
  let hardCount = 0;
  while ((m = hexRe.exec(css)) !== null) {
    const hex = normalizeHex(`#${m[1]}`);
    if (!hex) continue;
    hardCount++;
    const before = css.slice(Math.max(0, m.index - 60), m.index);
    const prop = before.match(/([\w-]+)\s*:\s*$/)?.[1] ?? "couleur";
    candidates.push({
      hex,
      weight: looksLikeColorName(prop) ? 2 : 1,
      evidence: `${prop} dans ${filename}`,
      source: "css",
    });
  }

  const fnRe = /(rgba?|hsla?)\([^)]*\)/gi;
  while ((m = fnRe.exec(css)) !== null) {
    const hex = normalizeHex(m[0]);
    if (!hex) continue;
    hardCount++;
    candidates.push({
      hex,
      weight: 1,
      evidence: `valeur ${m[1]}() dans ${filename}`,
      source: "css",
    });
  }

  const merged = mergeSimilarColors(candidates);

  const notes: string[] = [];
  if (varCount > 0) notes.push(`${varCount} variable(s) de couleur`);
  if (faceCount > 0) notes.push(`${faceCount} @font-face`);
  if (hardCount > 0) notes.push(`${hardCount} couleur(s) en dur`);

  if (merged.length === 0 && familyWeights.size === 0) {
    throw new BrandParseError(
      `Aucune couleur ni police exploitable dans ${filename}. ` +
        `Vérifiez qu'il s'agit bien d'une feuille de style de charte (variables --*, couleurs, font-family).`
    );
  }

  return {
    candidates: merged,
    faces,
    families: [...familyWeights.entries()]
      .map(([family, v]) => ({ family, ...v }))
      .sort((a, b) => b.weight - a.weight),
    notes,
  };
}

function addFamilies(
  rawValue: string,
  evidence: string,
  acc: Map<string, { weight: number; evidence: string }>
): void {
  const first = rawValue
    .split(",")[0]
    ?.trim()
    .replace(/!important$/i, "")
    .trim();
  if (!first) return;
  const family = stripQuotes(first);
  if (!family || isGenericFamily(family)) return;
  addFamily(family, evidence, acc, 3);
}

function addFamily(
  family: string,
  evidence: string,
  acc: Map<string, { weight: number; evidence: string }>,
  weight: number
): void {
  const existing = acc.get(family);
  if (existing) {
    existing.weight += weight;
    if (!existing.evidence.includes(evidence)) {
      existing.evidence = `${existing.evidence} · ${evidence}`;
    }
  } else {
    acc.set(family, { weight, evidence });
  }
}

const GENERIC_FAMILIES = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong",
]);

function isGenericFamily(family: string): boolean {
  return GENERIC_FAMILIES.has(family.toLowerCase());
}

function stripQuotes(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").trim();
}
