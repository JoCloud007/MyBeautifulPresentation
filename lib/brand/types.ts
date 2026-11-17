/**
 * Types du "brand kit" : représentation normalisée d'une charte client,
 * entre les parseurs (CSS / PPTX / PDF) et le mapping vers `Template`.
 *
 * Séparation volontaire : les parseurs ne décident de RIEN. Ils produisent des
 * candidats horodatés et sourcés ; `lib/brand/infer.ts` attribue les rôles.
 * C'est ce qui rend chaque décision auditable (`evidence`) et revisable par un
 * humain dans le wizard.
 */

/** Rôles de couleur attendus par `TemplateColor`. */
export type BrandColorRole =
  | "primary"
  | "secondary"
  | "accent"
  | "background"
  | "foreground"
  | "muted"
  | "border";

export const BRAND_COLOR_ROLES: BrandColorRole[] = [
  "primary",
  "secondary",
  "accent",
  "background",
  "foreground",
  "muted",
  "border",
];

/** Provenance d'un token — affichée dans le wizard, jamais devinée. */
export type BrandSource = "css" | "pptx" | "pdf" | "manual" | "derived";

export interface BrandToken<T> {
  value: T;
  source: BrandSource;
  /** 0 → 1. Sert à trier/alerter dans l'UI, jamais à bloquer. */
  confidence: number;
  /** Phrase courte montrant d'où vient la valeur ("accent1 du thème PPTX"). */
  evidence?: string;
}

/**
 * Occurrence brute d'une couleur, avant attribution de rôle.
 * `weight` = nombre d'apparitions pondéré par la source (voir chaque parseur).
 */
export interface BrandColorCandidate {
  hex: string;
  weight: number;
  evidence: string;
  source: BrandSource;
}

export interface BrandFontFace {
  family: string;
  /** URL absolue ou data URL. Jamais fetchée côté serveur (anti-SSRF). */
  url?: string;
  weight?: string;
  style?: string;
}

export interface BrandLogo {
  id: string;
  /** Data URL prête à l'emploi, ou URL publique uploadée. */
  dataUrl?: string;
  url?: string;
  format: "svg" | "png" | "jpg";
  bytes: number;
  /** Nom de fichier d'origine, affiché dans le wizard. */
  name: string;
}

export interface BrandIcon {
  id: string;
  name: string;
  dataUrl?: string;
  /** Contenu SVG brut (déjà sanitizé) pour inliner dans le rendu. */
  svg?: string;
}

export interface BrandRadiusScale {
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface BrandSpacingScale {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

/**
 * Résultat normalisé d'une analyse de charte.
 * Tout est optionnel sauf `name` et `colorCandidates` : une charte CSS peut
 * n'avoir ni logo ni police exploitable, et le wizard doit rester utilisable.
 */
export interface BrandTokens {
  name: string;
  colors: Partial<Record<BrandColorRole, BrandToken<string>>>;
  colorCandidates: BrandColorCandidate[];
  fonts: {
    heading?: BrandToken<string>;
    body?: BrandToken<string>;
    faces: BrandFontFace[];
  };
  logos: BrandLogo[];
  icons: BrandIcon[];
  radius?: BrandRadiusScale;
  spacing?: BrandSpacingScale;
  /** Sources réellement lues, dans l'ordre d'ingestion. */
  sources: Array<{ kind: BrandSource; name: string }>;
  warnings: string[];
}

/** Erreur d'analyse destinée à être affichée telle quelle à l'utilisateur. */
export class BrandParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrandParseError";
  }
}

/** Charte vide, utile comme point de départ et dans les tests. */
export function emptyBrandTokens(name = "Nouvelle charte"): BrandTokens {
  return {
    name,
    colors: {},
    colorCandidates: [],
    fonts: { faces: [] },
    logos: [],
    icons: [],
    sources: [],
    warnings: [],
  };
}
