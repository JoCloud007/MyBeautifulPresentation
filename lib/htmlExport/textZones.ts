/**
 * textZones.ts — single source of truth for PowerPoint text zones.
 *
 * Given a {@link Slide} and its {@link Template}, produces the list of editable
 * text zones used by BOTH export modes of the HTML-first PPTX engine:
 *   - hybrid ("design fidèle"): native PowerPoint text boxes layered over the
 *     captured HTML background PNG (text is NEVER flattened into an image);
 *   - native: the `addText` calls of PptxGenJS.
 *
 * A zone exposes exactly:
 *   { text, xPct, yPct, wPct, hPct, fontSize, fontFace, color, align, bold }
 *
 * Coordinates are percentages of the slide. The 16:9 slide is 10 × 5.625 in, so
 * the % → inches conversion used by the PPTX layer is:
 *   x = xPct / 10            (i.e. xPct / 100 × 10 in)
 *   y = yPct / 100 × 5.625
 *   w = wPct / 10            (i.e. wPct / 100 × 10 in)
 *   h = hPct / 100 × 5.625
 * See {@link textZoneToInches} and the `pctToInches*` helpers below.
 *
 * Text blocks handled (one zone per block, for every supported layout):
 *   - the slide title,
 *   - the slide content (the `two-column` layout splits it on the FIRST pipe
 *     '|' into two distinct columns, each with its own zone),
 *   - every `slide.elements` entry of type "text" or "table".
 *
 * Supported layouts: title, title-content, title-only, content-only,
 * two-column, image-left, image-right, timeline, gantt. Unknown layouts fall
 * back to the title-content geometry (same fallback as `lib/pptxExport.ts`).
 *
 * Font sizes come from the template (`template.fontSizes.heading` / `.body`,
 * defaults 48 / 18 pt) scaled per layout slot, so theme typography propagates
 * to both renderers. Colors come from `template.colors` / `element.style`.
 */

import type { Slide, SlideElement, SlideElementStyle } from "@/app/types/presentation";
import type { Template } from "@/app/types/template";

/** 16:9 slide dimensions, in inches. */
export const SLIDE_WIDTH_IN = 10;
export const SLIDE_HEIGHT_IN = 5.625;

export interface TextZone {
  text: string;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  fontSize: number;
  fontFace: string;
  color: string;
  align: "left" | "center" | "right";
  bold: boolean;
}

export interface TextZoneInches {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ------------------------------------------------------------------ */
/* % → inches (16:9, 10 × 5.625 in)                                    */
/* ------------------------------------------------------------------ */

/** xPct (%) → inches on a 10 in wide slide: xPct / 10. */
export function pctToInchesX(xPct: number): number {
  return xPct / 10;
}

/** yPct (%) → inches on a 5.625 in high slide: yPct / 100 × 5.625. */
export function pctToInchesY(yPct: number): number {
  return (yPct / 100) * SLIDE_HEIGHT_IN;
}

/** wPct (%) → inches on a 10 in wide slide: wPct / 10. */
export function pctToInchesW(wPct: number): number {
  return wPct / 10;
}

/** hPct (%) → inches on a 5.625 in high slide: hPct / 100 × 5.625. */
export function pctToInchesH(hPct: number): number {
  return (hPct / 100) * SLIDE_HEIGHT_IN;
}

/** Converts a zone's percentage rectangle to inches for a 10 × 5.625 in slide. */
export function textZoneToInches(zone: TextZone): TextZoneInches {
  return {
    x: pctToInchesX(zone.xPct),
    y: pctToInchesY(zone.yPct),
    w: pctToInchesW(zone.wPct),
    h: pctToInchesH(zone.hPct),
  };
}

/** Converts a list of zones to their inch rectangles (10 × 5.625 in slide). */
export function textZonesToInches(zones: TextZone[]): TextZoneInches[] {
  return zones.map(textZoneToInches);
}

/* ------------------------------------------------------------------ */
/* Theme resolution                                                    */
/* ------------------------------------------------------------------ */

interface Theme {
  headingFont: string;
  bodyFont: string;
  fg: string;
  secondary: string;
  headingSize: number;
  bodySize: number;
}

const DEFAULT_HEADING_FONT = "Arial";
const DEFAULT_BODY_FONT = "Arial";
const DEFAULT_FG = "#000000";
const DEFAULT_SECONDARY = "#666666";
const DEFAULT_HEADING_SIZE = 48;
const DEFAULT_BODY_SIZE = 18;

/** First family of a CSS font stack, quotes stripped, with fallback. */
function firstFont(fontStack: string | undefined, fallback: string): string {
  const stack = (fontStack ?? "").trim();
  if (!stack) return fallback;
  const first = stack.split(",")[0].trim().replace(/^["']|["']$/g, "");
  return first || fallback;
}

function resolveTheme(template?: Template): Theme {
  return {
    headingFont: firstFont(template?.fonts.heading, DEFAULT_HEADING_FONT),
    bodyFont: firstFont(template?.fonts.body, DEFAULT_BODY_FONT),
    fg: template?.colors.foreground || DEFAULT_FG,
    secondary: template?.colors.secondary || DEFAULT_SECONDARY,
    headingSize: template?.fontSizes?.heading ?? DEFAULT_HEADING_SIZE,
    bodySize: template?.fontSizes?.body ?? DEFAULT_BODY_SIZE,
  };
}

/** Scales a base point size by a layout ratio, rounded to a whole point. */
function scaledSize(base: number, ratio: number): number {
  return Math.round(base * ratio);
}

function isBoldWeight(weight: number | string | undefined): boolean {
  if (weight === undefined) return false;
  if (typeof weight === "string") {
    const w = weight.trim().toLowerCase();
    if (w === "bold" || w === "bolder") return true;
    const n = Number(w);
    return !Number.isNaN(n) && n >= 600;
  }
  return weight >= 600;
}

/* ------------------------------------------------------------------ */
/* Geometry (percentages of the slide, per layout slot)                */
/* ------------------------------------------------------------------ */

interface ZoneGeometry {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

interface LayoutSlots {
  title: ZoneGeometry;
  content: ZoneGeometry;
  /** Second column geometry (two-column only). */
  contentRight?: ZoneGeometry;
  titleAlign: "left" | "center";
  titleSizeRatio: number;
  contentAlign: "left" | "center";
  contentSizeRatio: number;
  /** Title layout shows the subtitle in the secondary color. */
  contentSecondary?: boolean;
}

const LAYOUT_SLOTS: Record<string, LayoutSlots> = {
  title: {
    title: { xPct: 5, yPct: 40.9, wPct: 90, hPct: 21.3 },
    content: { xPct: 5, yPct: 65.8, wPct: 90, hPct: 21.3 },
    titleAlign: "center",
    titleSizeRatio: 5 / 6,
    contentAlign: "center",
    contentSizeRatio: 10 / 9,
    contentSecondary: true,
  },
  "title-content": {
    title: { xPct: 5, yPct: 5.3, wPct: 90, hPct: 14.2 },
    content: { xPct: 5, yPct: 23.1, wPct: 90, hPct: 78 },
    titleAlign: "left",
    titleSizeRatio: 2 / 3,
    contentAlign: "left",
    contentSizeRatio: 1,
  },
  "title-only": {
    title: { xPct: 5, yPct: 35, wPct: 88, hPct: 26.7 },
    content: { xPct: 5, yPct: 64, wPct: 88, hPct: 26 },
    titleAlign: "left",
    titleSizeRatio: 11 / 12,
    contentAlign: "left",
    contentSizeRatio: 1,
  },
  "content-only": {
    title: { xPct: 5, yPct: 2, wPct: 90, hPct: 10 },
    content: { xPct: 5, yPct: 12, wPct: 90, hPct: 80 },
    titleAlign: "left",
    titleSizeRatio: 2 / 3,
    contentAlign: "left",
    contentSizeRatio: 1,
  },
  "two-column": {
    title: { xPct: 5, yPct: 5.3, wPct: 90, hPct: 14.2 },
    content: { xPct: 5, yPct: 23.1, wPct: 44, hPct: 75 },
    contentRight: { xPct: 51, yPct: 23.1, wPct: 44, hPct: 75 },
    titleAlign: "left",
    titleSizeRatio: 2 / 3,
    contentAlign: "left",
    contentSizeRatio: 8 / 9,
  },
  "image-left": {
    title: { xPct: 44, yPct: 25, wPct: 52, hPct: 14.2 },
    content: { xPct: 44, yPct: 38, wPct: 52, hPct: 55 },
    titleAlign: "left",
    titleSizeRatio: 7 / 12,
    contentAlign: "left",
    contentSizeRatio: 8 / 9,
  },
  "image-right": {
    title: { xPct: 4, yPct: 25, wPct: 52, hPct: 14.2 },
    content: { xPct: 4, yPct: 38, wPct: 52, hPct: 55 },
    titleAlign: "left",
    titleSizeRatio: 7 / 12,
    contentAlign: "left",
    contentSizeRatio: 8 / 9,
  },
  timeline: {
    title: { xPct: 5, yPct: 5.3, wPct: 90, hPct: 10.7 },
    content: { xPct: 5, yPct: 81, wPct: 90, hPct: 15 },
    titleAlign: "left",
    titleSizeRatio: 7 / 12,
    contentAlign: "left",
    contentSizeRatio: 1,
  },
  gantt: {
    title: { xPct: 5, yPct: 5.3, wPct: 90, hPct: 10.7 },
    content: { xPct: 5, yPct: 81, wPct: 90, hPct: 15 },
    titleAlign: "left",
    titleSizeRatio: 7 / 12,
    contentAlign: "left",
    contentSizeRatio: 1,
  },
};

const DEFAULT_SLOTS: LayoutSlots = LAYOUT_SLOTS["title-content"];

/* ------------------------------------------------------------------ */
/* Zone builders                                                       */
/* ------------------------------------------------------------------ */

function makeZone(
  text: string,
  geometry: ZoneGeometry,
  style: {
    fontSize: number;
    fontFace: string;
    color: string;
    align: "left" | "center" | "right";
    bold: boolean;
  }
): TextZone {
  return {
    text,
    xPct: geometry.xPct,
    yPct: geometry.yPct,
    wPct: geometry.wPct,
    hPct: geometry.hPct,
    fontSize: style.fontSize,
    fontFace: style.fontFace,
    color: style.color,
    align: style.align,
    bold: style.bold,
  };
}

/**
 * Splits `two-column` content on the FIRST pipe only, so later pipes stay
 * inside the right column (same rule as the HTML renderer / pptxExport).
 * Without a pipe the whole content goes to the left column and no right
 * column zone is produced.
 */
function splitTwoColumns(content: string): { left: string; right: string | null } {
  const pipeIndex = content.indexOf("|");
  if (pipeIndex < 0) {
    return { left: content, right: null };
  }
  return {
    left: content.slice(0, pipeIndex).trim(),
    right: content.slice(pipeIndex + 1).trim(),
  };
}

function elementZone(element: SlideElement, theme: Theme): TextZone | null {
  if (element.type !== "text" && element.type !== "table") return null;
  const style: SlideElementStyle = element.style ?? {};
  const isTable = element.type === "table";
  return makeZone(
    element.content ?? "",
    { xPct: element.x, yPct: element.y, wPct: element.w, hPct: element.h },
    {
      fontSize: style.fontSize ?? (isTable ? 10 : theme.bodySize),
      fontFace: firstFont(style.fontFamily, theme.bodyFont),
      color: style.color ?? theme.fg,
      align: style.textAlign ?? "left",
      bold: isBoldWeight(style.fontWeight),
    }
  );
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Single source of truth for the editable PowerPoint text zones of a slide.
 *
 * Two mutually exclusive shapes, matching what the renderers actually draw:
 *
 *  - a slide WITH `elements` is rendered from those elements only, so the
 *    zones are exactly the `text` / `table` elements (title/content are not
 *    drawn and therefore produce no zone — otherwise the exported PPTX would
 *    duplicate the text);
 *  - a slide WITHOUT `elements` yields one zone per text block — the title,
 *    plus the content (two zones for `two-column`, split on the first '|') —
 *    each with the full `{ text, xPct, yPct, wPct, hPct, fontSize, fontFace,
 *    color, align, bold }` shape, for every supported layout (title,
 *    title-content, title-only, content-only, two-column, image-left,
 *    image-right, timeline, gantt).
 *
 * Empty blocks (empty title / content) produce no zone.
 *
 * Percentages convert to inches on a 16:9 10 × 5.625 in slide via
 * {@link textZoneToInches}.
 */
export function getTextZones(slide: Slide, template?: Template): TextZone[] {
  const theme = resolveTheme(template);
  const slots = LAYOUT_SLOTS[slide.layout] ?? DEFAULT_SLOTS;
  const zones: TextZone[] = [];

  // A slide carrying WYSIWYG `elements` is rendered from those elements ONLY —
  // every renderer (SlideCanvas, SlideRenderer, SlideEngine) ignores
  // title/content in that case. Emitting title/content zones here as well would
  // duplicate the text in the exported PPTX, so the element zones are the whole
  // truth for such a slide.
  if (slide.elements && slide.elements.length > 0) {
    for (const element of slide.elements) {
      const zone = elementZone(element, theme);
      if (zone) zones.push(zone);
    }
    return zones;
  }

  const titleText = slide.title ?? "";
  if (titleText.trim() !== "") {
    zones.push(
      makeZone(titleText, slots.title, {
        fontSize: scaledSize(theme.headingSize, slots.titleSizeRatio),
        fontFace: theme.headingFont,
        color: theme.fg,
        align: slots.titleAlign,
        bold: true,
      })
    );
  }

  const contentText = slide.content ?? "";
  if (contentText.trim() !== "") {
    const contentStyle = {
      fontSize: scaledSize(theme.bodySize, slots.contentSizeRatio),
      fontFace: theme.bodyFont,
      color: slots.contentSecondary ? theme.secondary : theme.fg,
      align: slots.contentAlign,
      bold: false,
    };

    if (slide.layout === "two-column") {
      const { left, right } = splitTwoColumns(contentText);
      zones.push(makeZone(left, slots.content, contentStyle));
      if (right !== null && slots.contentRight) {
        zones.push(makeZone(right, slots.contentRight, contentStyle));
      }
    } else {
      zones.push(makeZone(contentText, slots.content, contentStyle));
    }
  }

  return zones;
}

/* ------------------------------------------------------------------ */
/* Convenience aliases (same single source of truth)                   */
/* ------------------------------------------------------------------ */

/** Alias of {@link getTextZones}. */
export const computeTextZones = getTextZones;
/** Alias of {@link getTextZones}. */
export const buildTextZones = getTextZones;
/** Alias of {@link getTextZones}. */
export const getSlideTextZones = getTextZones;
/** Alias of {@link TextZone}. */
export type TextZoneSpec = TextZone;
