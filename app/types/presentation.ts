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

export interface ChronologyRow {
  id: number;
  task: string;
  start: string;
  duration: string;
  color: string;
  parentId?: number;
}

export interface SlideData {
  gantt?: {
    tasks: GanttTask[];
    viewMode?: TimeScale;
  };
  timeline?: {
    events: TimelineEvent[];
    viewMode?: TimeScale;
  };
  chronology?: {
    rows: ChronologyRow[];
    type: "gantt" | "timeline" | "roadmap";
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
  | "excalidraw"
  | "roadmap"
  | "architecture"
  | "comparison";

export type SlideType = "content" | "chronology" | "diagram" | "powerbi";

export interface SlideElementStyle {
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number | string;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  /** px (number) or any CSS length/percentage (e.g. "50%" for a circle). */
  borderRadius?: number | string;
  textAlign?: "left" | "center" | "right";
  padding?: number;
  opacity?: number;
  rotation?: number;
  zIndex?: number;
}

export interface PowerBiConfig {
  embedUrl: string;
  reportId?: string;
  pageName?: string;
  title: string;
  mode: "publish-to-web" | "secure-embed";
}

export interface SlideElement {
  id: string;
  type: "text" | "shape" | "image" | "table" | "chronology" | "diagram" | "powerbi";
  subtype?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  content?: string;
  style?: SlideElementStyle;
}

export interface Slide {
  id: string;
  title: string;
  content: string;
  layout: SlideLayout;
  data?: SlideData;
  notes?: string;
  elements?: SlideElement[];
}

export interface Presentation {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  slides: Slide[];
  createdAt: number;
  updatedAt: number;
  /**
   * Internal migration marker: the one-shot cleanup of legacy element styles
   * (hard-coded palette + undersized font sizes) already ran on this deck.
   */
  legacyStylesNormalized?: boolean;
}
