export interface GanttTask {
  id: string;
  name: string;
  startDate: string; // ISO 8601 YYYY-MM-DD
  endDate: string;   // ISO 8601 YYYY-MM-DD
  color?: string;
  progress?: number; // 0-100
}

export interface TimelineEvent {
  id: string;
  date: string;      // ISO 8601 YYYY-MM-DD
  title: string;
  description?: string;
  color?: string;
}

export type TimeScale = "days" | "weeks" | "months" | "quarters" | "years" | "decades";

export interface SlideData {
  gantt?: {
    tasks: GanttTask[];
    viewMode?: TimeScale;
  };
  timeline?: {
    events: TimelineEvent[];
    viewMode?: TimeScale;
  };
}

export type SlideLayout =
  | "title"
  | "title-content"
  | "two-column"
  | "title-only"
  | "content-only"
  | "image-left"
  | "image-right"
  | "timeline"
  | "gantt"
  | "mermaid"
  | "excalidraw";

export interface Slide {
  id: string;
  title: string;
  content: string;
  layout: SlideLayout;
  data?: SlideData;
  notes?: string;
}

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
