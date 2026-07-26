export interface Slide {
  id: string;
  title: string;
  content: string;
  layout: SlideLayout;
  notes?: string;
}

export type SlideLayout =
  | "title"
  | "title-content"
  | "two-column"
  | "title-only"
  | "content-only"
  | "image-left"
  | "image-right";

export interface Presentation {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  slides: Slide[];
  createdAt: number;
  updatedAt: number;
}

export interface SlideElement {
  type: "text" | "image" | "shape" | "chart";
  x: number;
  y: number;
  w: number;
  h: number;
  content?: string;
  style?: Record<string, unknown>;
}
