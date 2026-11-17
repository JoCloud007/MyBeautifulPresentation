import { SlideLayout } from "./presentation";

export interface TemplateColor {
  name: string;
  background: string;
  foreground: string;
  accent: string;
  secondary: string;
  muted: string;
  border: string;
}

export interface TemplateFont {
  heading: string;
  body: string;
}

export interface TemplateSlide {
  layout: SlideLayout;
  background?: string;
}

export interface TemplateGradientStop {
  color: string;
  position: number;
}

export interface TemplateGradient {
  direction: string;
  stops: TemplateGradientStop[];
}

export interface TemplateBackground {
  type: "color" | "image" | "gradient";
  color?: string;
  imageUrl?: string;
  opacity?: number;
  gradient?: TemplateGradient;
}

export interface TemplateHeader {
  text: string;
  enabled: boolean;
  showDate: boolean;
}

export interface TemplateFooter {
  text: string;
  enabled: boolean;
  showPageNumber: boolean;
  showDate: boolean;
}

export interface TemplateSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface TemplateBorderRadius {
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface TemplateShadow {
  sm: string;
  md: string;
  lg: string;
  glow?: string;
}

/**
 * Placement du logo dans une slide. Les quatre positions sont des zones
 * réservées du gabarit : le logo ne peut pas chevaucher le contenu.
 */
export type TemplateLogoPlacement =
  | "header-left"
  | "header-right"
  | "title"
  | "footer-left"
  | "footer-right";

export interface TemplateLogo {
  /** Data URL ou URL publique (`/brand/<id>/logo.svg`). */
  url: string;
  alt?: string;
  placement: TemplateLogoPlacement;
  /** Hauteur max en % de la hauteur de slide (jamais en px : export-safe). */
  maxHeight: number;
  /** 0 → 1. */
  opacity?: number;
}

export interface TemplateIconSet {
  style: "line" | "solid" | "duotone";
  colorRole: "accent" | "primary" | "foreground";
  /** Icônes nommées, inlinées en SVG sanitizé. */
  icons?: Array<{ name: string; svg: string }>;
}

/** Provenance d'une charte client, affichée dans l'éditeur. */
export interface TemplateBrandInfo {
  source: "css" | "pptx" | "pdf" | "mixed" | "manual";
  sourceName: string;
  importedAt: string;
  /** Confiance par rôle de couleur / police, 0 → 1. */
  confidence?: Record<string, number>;
  warnings?: string[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: "corporate" | "tech" | "minimal" | "creative" | "startup" | "academic" | "dark-luxury" | "brand";
  colors: TemplateColor;
  fonts: TemplateFont;
  fontSizes?: {
    heading?: number;
    body?: number;
  };
  background?: TemplateBackground;
  header?: TemplateHeader;
  footer?: TemplateFooter;
  spacing?: TemplateSpacing;
  borderRadius?: TemplateBorderRadius;
  shadows?: TemplateShadow;
  defaultSlides: TemplateSlide[];
  thumbnail?: string;
  /**
   * Identifiant du thème visuel haut de gamme rendu par `SlideEngine`
   * (couche de décor `app/design-system/slide-themes/`).
   * Absent = rendu classique du template (rétro-compatible).
   * `"brand"` = décor dérivé des couleurs de la charte (voir brandToTemplate).
   */
  slideTheme?: "editorial" | "dark-tech" | "bold" | "brand";
  /**
   * Logo de la charte, placé dans une zone réservée. Absent = pas de logo
   * (comportement identique aux templates antérieurs).
   */
  logo?: TemplateLogo;
  /** Pictogrammes de la charte, inlinés en SVG sanitizé. */
  iconSet?: TemplateIconSet;
  /**
   * Polices à charger dynamiquement via `FontFace`. L'export hybride attend
   * `document.fonts.ready`, donc une police déclarée ici est garantie chargée
   * au moment de la capture.
   */
  fontSources?: Array<{
    family: string;
    url: string;
    weight?: string;
    style?: string;
  }>;
  /** Métadonnées de provenance d'une charte client. */
  brand?: TemplateBrandInfo;
}

export type TemplateId =
  | "corporate"
  | "tech"
  | "minimal"
  | "startup"
  | "academic"
  | "creative"
  | "dark-luxury"
  | "editorial"
  | "dark-tech"
  | "bold";

/** Schema version for .mbpt.json import/export */
export const TEMPLATE_SCHEMA_VERSION = "2.0";

export interface MbptTemplateV2 {
  version: string;
  template: Template;
}
