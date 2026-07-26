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

export interface Template {
  id: string;
  name: string;
  description: string;
  category: "corporate" | "tech" | "minimal" | "creative";
  colors: TemplateColor;
  fonts: TemplateFont;
  defaultSlides: TemplateSlide[];
  thumbnail?: string;
}

export type TemplateId = "corporate" | "tech" | "minimal";
