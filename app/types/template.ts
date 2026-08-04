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

export interface TemplateBackground {
  type: "color" | "image";
  color?: string;
  imageUrl?: string;
  opacity?: number;
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

export interface Template {
  id: string;
  name: string;
  description: string;
  category: "corporate" | "tech" | "minimal" | "creative";
  colors: TemplateColor;
  fonts: TemplateFont;
  fontSizes?: {
    heading?: number;
    body?: number;
  };
  background?: TemplateBackground;
  header?: TemplateHeader;
  footer?: TemplateFooter;
  defaultSlides: TemplateSlide[];
  thumbnail?: string;
}

export type TemplateId = "corporate" | "tech" | "minimal";
