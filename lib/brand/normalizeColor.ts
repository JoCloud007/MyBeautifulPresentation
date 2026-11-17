/**
 * Normalisation et arithmétique des couleurs de charte.
 *
 * Tout est ramené en `#rrggbb` minuscule pour que les comparaisons, la
 * déduplication et les tests soient déterministes. Les couleurs avec alpha
 * sont composées sur blanc par défaut (une charte est destinée à des slides
 * opaques) sauf demande explicite contraire.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  navy: "#000080",
  teal: "#008080",
  olive: "#808000",
  purple: "#800080",
  maroon: "#800000",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  orange: "#ffa500",
  gold: "#ffd700",
  yellow: "#ffff00",
  lime: "#00ff00",
  aqua: "#00ffff",
  cyan: "#00ffff",
  fuchsia: "#ff00ff",
  magenta: "#ff00ff",
  pink: "#ffc0cb",
  brown: "#a52a2a",
  beige: "#f5f5dc",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  indigo: "#4b0082",
  violet: "#ee82ee",
  crimson: "#dc143c",
  salmon: "#fa8072",
  coral: "#ff7f50",
  turquoise: "#40e0d0",
  transparent: "#ffffff",
};

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex2(n: number): string {
  return clamp255(n).toString(16).padStart(2, "0");
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

export function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

/**
 * Ramène `#abc`, `#aabbcc`, `#aabbccdd`, `rgb(…)`, `hsl(…)` ou un nom CSS
 * courant à `#rrggbb`. Retourne `null` si la valeur n'est pas une couleur.
 */
export function normalizeHex(input: string): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  if (raw.startsWith("#")) {
    const body = raw.slice(1);
    if (/^[0-9a-f]{3}$/.test(body)) {
      return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`;
    }
    if (/^[0-9a-f]{4}$/.test(body)) {
      // #rgba → ignore alpha, expansion comme #rgb
      return `#${body[0]}${body[0]}${body[1]}${body[1]}${body[2]}${body[2]}`;
    }
    if (/^[0-9a-f]{6}$/.test(body)) return `#${body}`;
    if (/^[0-9a-f]{8}$/.test(body)) return `#${body.slice(0, 6)}`;
    return null;
  }

  const named = NAMED_COLORS[raw];
  if (named) return named;

  const rgbMatch = raw.match(
    /^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*(?:[,/]\s*([\d.%]+)\s*)?\)$/
  );
  if (rgbMatch) {
    const channel = (token: string): number =>
      token.endsWith("%")
        ? (parseFloat(token) / 100) * 255
        : parseFloat(token);
    const r = channel(rgbMatch[1]);
    const g = channel(rgbMatch[2]);
    const b = channel(rgbMatch[3]);
    const alpha = parseAlpha(rgbMatch[4]);
    if (alpha >= 1) return rgbToHex({ r, g, b });
    // Compose sur blanc : les slides sont opaques.
    return rgbToHex({
      r: r * alpha + 255 * (1 - alpha),
      g: g * alpha + 255 * (1 - alpha),
      b: b * alpha + 255 * (1 - alpha),
    });
  }

  const hslMatch = raw.match(
    /^hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*(?:[,/]\s*([\d.%]+)\s*)?\)$/
  );
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]) / 360;
    const s = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    const { r, g, b } = hslToRgb(h, s, l);
    const alpha = parseAlpha(hslMatch[4]);
    if (alpha >= 1) return rgbToHex({ r, g, b });
    return rgbToHex({
      r: r * alpha + 255 * (1 - alpha),
      g: g * alpha + 255 * (1 - alpha),
      b: b * alpha + 255 * (1 - alpha),
    });
  }

  return null;
}

function parseAlpha(token: string | undefined): number {
  if (!token) return 1;
  const value = token.endsWith("%")
    ? parseFloat(token) / 100
    : parseFloat(token);
  if (Number.isNaN(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return {
    r: hue2rgb(h + 1 / 3) * 255,
    g: hue2rgb(h) * 255,
    b: hue2rgb(h - 1 / 3) * 255,
  };
}

/** Luminance relative WCAG 2.1 (0 = noir, 1 = blanc). */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
  );
}

/** Ratio de contraste WCAG entre deux couleurs (1 → 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Saturation façon HSL, 0 → 1. Utilisée pour repérer la couleur d'accent. */
export function saturation(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

/** Vrai si la couleur est un gris (peu de saturation) — jamais un accent. */
export function isNeutral(hex: string, threshold = 0.12): boolean {
  return saturation(hex) < threshold;
}

/** Mélange linéaire `a` → `b` avec un ratio 0 → 1. */
export function mix(a: string, b: string, ratio: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return a;
  const t = Math.max(0, Math.min(1, ratio));
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

/**
 * Ajuste `fg` jusqu'à atteindre `minRatio` de contraste avec `bg`.
 * On déplace vers le noir ou le blanc selon le côté déjà le plus éloigné.
 * Retourne la couleur inchangée si elle est déjà conforme.
 */
export function ensureContrast(fg: string, bg: string, minRatio = 4.5): string {
  if (contrastRatio(fg, bg) >= minRatio) return fg;
  // On ne cherche pas la direction par rapport au texte mais par rapport au
  // FOND : sur un fond clair il faut descendre vers le noir, sur un fond sombre
  // monter vers le blanc. Comparer fg à bg donne un résultat faux dès que les
  // deux sont du même côté de la luminance moyenne.
  const target = relativeLuminance(bg) < 0.5 ? "#ffffff" : "#000000";
  for (let step = 1; step <= 20; step++) {
    const candidate = mix(fg, target, step / 20);
    if (contrastRatio(candidate, bg) >= minRatio) return candidate;
  }
  return target;
}

/** Distance perceptuelle grossière (RGBA euclidien) pour dédupliquer. */
export function colorDistance(a: string, b: string): number {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  if (!ca || !cb) return Number.POSITIVE_INFINITY;
  return Math.sqrt(
    Math.pow(ca.r - cb.r, 2) +
      Math.pow(ca.g - cb.g, 2) +
      Math.pow(ca.b - cb.b, 2)
  );
}

/**
 * Regroupe les couleurs quasi identiques et additionne leurs poids.
 * Garde la première occurrence (donc l'ordre d'apparition comme tie-breaker).
 */
export function mergeSimilarColors<
  T extends { hex: string; weight: number; evidence: string; source: string },
>(candidates: T[], tolerance = 12): T[] {
  const merged: T[] = [];
  for (const candidate of candidates) {
    const existing = merged.find(
      (m) => colorDistance(m.hex, candidate.hex) <= tolerance
    );
    if (existing) {
      existing.weight += candidate.weight;
      if (!existing.evidence.includes(candidate.evidence)) {
        existing.evidence = `${existing.evidence} · ${candidate.evidence}`;
      }
    } else {
      merged.push({ ...candidate });
    }
  }
  return merged;
}
