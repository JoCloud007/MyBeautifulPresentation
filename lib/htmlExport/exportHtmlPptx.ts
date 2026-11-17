/**
 * exportHtmlPptx.ts — two-mode HTML-first PPTX export engine.
 *
 * Orchestrates the whole export flow (Phase 1 of the HTML-first slide design
 * plan):
 *
 *   1. **"design-fidelity" mode (default, hybrid)** — per slide, the HTML
 *      render is captured as a full-bleed PNG background (3x via
 *      `lib/htmlExport/captureSlide.tsx` with `mode: "decor-only"` so text is
 *      masked out of the image) and the editable PowerPoint text boxes are
 *      layered ON TOP of it as native `addText` calls. **Text is never
 *      flattened into an image.**
 *   2. **"native" mode** — pure PptxGenJS shapes + text (100% editable, zero
 *      full-page image).
 *
 * In BOTH modes the text zones come from the single source of truth
 * `lib/htmlExport/textZones.ts` (% coordinates → inches for the 16:9
 * 10 × 5.625 in slide), the slide notes are exported to the PowerPoint notes,
 * and the transitions/animations reuse `generateTransitionXml` /
 * `generateTimingXml` from `lib/pptxExport.ts` (that module is NOT modified).
 *
 * **Fallback**: if the capture of a slide fails (html-to-image error, missing
 * font, timeout…), that slide is transparently rebuilt in native mode and the
 * caller is notified through {@link ExportHtmlPptxOptions.onNotification} —
 * the export never crashes. If the capture of EVERY slide failed, the whole
 * export runs in native mode (still with notification).
 */

import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import type { Presentation, Slide, SlideElement } from "@/app/types/presentation";
import type { Template } from "@/app/types/template";
import {
  generateTimingXml,
  generateTransitionXml,
} from "@/lib/pptxExport";
import {
  tryCaptureSlide,
  type CaptureSlideError,
} from "@/lib/htmlExport/captureSlide";
import {
  getTextZones,
  SLIDE_HEIGHT_IN,
  SLIDE_WIDTH_IN,
  type TextZone,
} from "@/lib/htmlExport/textZones";

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

/**
 * - `"design-fidelity"` (default): captured HTML background PNG + editable
 *   native text zones on top.
 * - `"native"`: PptxGenJS shapes + text only, everything editable.
 */
export type HtmlPptxExportMode = "design-fidelity" | "native";

/** What happened during the export (reported through `onNotification`). */
export type HtmlPptxNotificationType =
  | "capture-fallback" // one slide could not be captured → rebuilt in native
  | "native-fallback"; // no slide could be captured → whole export in native

export interface HtmlPptxNotification {
  type: HtmlPptxNotificationType;
  /** Human-readable message (safe to show to the end user). */
  message: string;
  /** 0-based slide index when the notification concerns a single slide. */
  slideIndex?: number;
  /** Typed capture failure, when the notification comes from the capture. */
  error?: CaptureSlideError;
}

export type HtmlPptxTransition = "fade" | "push";

export interface ExportHtmlPptxOptions {
  /** Export mode, default `"design-fidelity"`. */
  mode?: HtmlPptxExportMode;
  /**
   * Transition of every slide (or per-slide when an array is given).
   * Default: `fade` on even slides, `push` on odd slides (same rule as
   * `lib/pptxExport.ts`).
   */
  transition?: HtmlPptxTransition | HtmlPptxTransition[];
  /** Extra capture options forwarded to `captureSlideToPng` (hybrid mode). */
  capture?: {
    pixelRatio?: number;
    timeoutMs?: number;
    fontsTimeoutMs?: number;
    imagesTimeoutMs?: number;
    allowFontFallback?: boolean;
    settleMs?: number;
  };
  /** Fallback / error notifications (capture failure → native mode). */
  onNotification?: (notification: HtmlPptxNotification) => void;
  /** Set `false` to skip the automatic download (advanced / tests). */
  download?: boolean;
  /**
   * Overrides the sanitized file name (WITHOUT extension). When omitted the
   * name is derived from the presentation title (see {@link sanitizeFileName}).
   */
  fileName?: string;
  /** Injected for testing: returns the PNG data-URL of one slide. */
  captureSlide?: (slide: Slide, template: Template) => Promise<string>;
  /** Injected for testing: receives the final .pptx blob and file name. */
  onDownload?: (blob: Blob, fileName: string) => void;
}

export interface HtmlPptxExportResult {
  /** The mode actually used for the whole deck (`"native"` after a full fallback). */
  mode: HtmlPptxExportMode;
  /**
   * Per-slide effective mode: `"design-fidelity"` when the captured
   * background was used, `"native"` when the slide was rebuilt from shapes
   * (capture fallback).
   */
  slideModes: Array<HtmlPptxExportMode>;
  /** Sanitized base file name (without `.pptx`). */
  fileName: string;
  /** `.pptx` blob (OOXML zip). */
  blob: Blob;
  /** All notifications emitted during the export. */
  notifications: HtmlPptxNotification[];
}

/* ------------------------------------------------------------------ */
/* Small helpers (mirroring lib/pptxExport.ts semantics)               */
/* ------------------------------------------------------------------ */

function stripHash(color: string): string {
  return color.startsWith("#") ? color.slice(1) : color;
}

/**
 * Sanitized download file name derived from the presentation title
 * (letters/digits/spaces/dash/underscore kept, spaces → `_`), with
 * `"presentation"` as the final fallback — same rules as `lib/pptxExport.ts`.
 */
export function sanitizeFileName(title: string | undefined): string {
  return (
    (title || "")
      .replace(/[^\p{L}\p{N}\s\-_]/gu, "")
      .replace(/\s+/g, "_")
      .trim() || "presentation"
  );
}

function withExtension(base: string): string {
  return `${base}.pptx`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function defaultTransition(slideIdx: number): HtmlPptxTransition {
  return slideIdx % 2 === 0 ? "fade" : "push";
}

function resolveTransition(
  transition: ExportHtmlPptxOptions["transition"],
  slideIdx: number
): HtmlPptxTransition {
  if (Array.isArray(transition)) {
    return transition[slideIdx] ?? defaultTransition(slideIdx);
  }
  return transition ?? defaultTransition(slideIdx);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/* ------------------------------------------------------------------ */
/* Native geometry (shapes + table)                                    */
/* ------------------------------------------------------------------ */

/**
 * Canvas `borderRadius` (px) → pptxgenjs `rectRadius` fraction (0.0–1.0 of
 * half the short side). The canvas presets are 4 / 16 / 50 px.
 */
function rectRadiusFraction(borderRadius: number | string | undefined): number {
  // A CSS string radius (e.g. "50%" for the circle preset) carries no px value:
  // fall back to the percentage when present, otherwise treat it as px.
  const radius =
    typeof borderRadius === "string" ? parseFloat(borderRadius) : (borderRadius ?? 0);
  if (!Number.isFinite(radius) || radius <= 0) return 0;
  return Math.min(radius / 100, 1);
}

/**
 * Builds the native geometry of a canvas shape. The visual source of truth is
 * the HTML render (`SlideRenderer.tsx`): a filled block with an optional
 * 1 px border — even `line` shapes are thin filled bars there.
 */
function shapeGeometry(element: SlideElement): PptxGenJS.ShapeProps {
  const style = element.style ?? {};
  const transparency =
    style.opacity !== undefined ? (1 - style.opacity) * 100 : undefined;

  const fill: PptxGenJS.ShapeFillProps = {
    color: stripHash(style.backgroundColor || "F1F5F9"),
  };
  if (transparency !== undefined) {
    fill.transparency = transparency;
  }

  const geometry: PptxGenJS.ShapeProps = {
    x: `${element.x}%`,
    y: `${element.y}%`,
    w: `${element.w}%`,
    h: `${element.h}%`,
    fill,
  };

  // pptxgenjs omits the outline when `line` is not set ({type: 'none'}), which
  // matches `borderWidth: 0` in the HTML render.
  const borderWidth = style.borderWidth ?? 1;
  if (borderWidth > 0) {
    const line: PptxGenJS.ShapeLineProps = {
      color: stripHash(style.borderColor || "94a3b8"),
      width: borderWidth,
    };
    if (transparency !== undefined) {
      line.transparency = transparency;
    }
    geometry.line = line;
  }
  if (style.rotation !== undefined) {
    geometry.rotate = style.rotation;
  }
  return geometry;
}

/** Native PowerPoint shape names (same values as `PptxGenJS.ShapeType`). */
const SHAPE_RECT: PptxGenJS.SHAPE_NAME = "rect";
const SHAPE_ELLIPSE: PptxGenJS.SHAPE_NAME = "ellipse";
const SHAPE_ROUND_RECT: PptxGenJS.SHAPE_NAME = "roundRect";
const SHAPE_RIGHT_ARROW: PptxGenJS.SHAPE_NAME = "rightArrow";

/** Rebuilds canvas shapes as native PowerPoint shapes (fully editable). */
function addNativeShape(s: PptxGenJS.Slide, element: SlideElement): void {
  const subtype = (element.subtype || "rectangle").toLowerCase();
  const geometry = shapeGeometry(element);
  if (subtype === "circle") {
    s.addShape(SHAPE_ELLIPSE, geometry);
    return;
  }
  if (subtype === "arrow") {
    s.addShape(SHAPE_RIGHT_ARROW, geometry);
    return;
  }
  if (subtype === "rounded") {
    geometry.rectRadius = rectRadiusFraction(element.style?.borderRadius) || 0.16;
    s.addShape(SHAPE_ROUND_RECT, geometry);
    return;
  }
  // rectangle / line (thin filled bar in the HTML render) / anything else
  s.addShape(SHAPE_RECT, geometry);
}

/* ------------------------------------------------------------------ */
/* Editable text zones (source of truth: lib/htmlExport/textZones.ts)  */
/* ------------------------------------------------------------------ */

/** Adds every text zone of a slide as a native editable PowerPoint text box. */
function addTextZones(s: PptxGenJS.Slide, zones: TextZone[]): void {
  for (const zone of zones) {
    if (zone.text.trim() === "") continue;
    s.addText(zone.text, {
      x: `${zone.xPct}%`,
      y: `${zone.yPct}%`,
      w: `${zone.wPct}%`,
      h: `${zone.hPct}%`,
      fontSize: zone.fontSize,
      fontFace: zone.fontFace,
      color: stripHash(zone.color),
      bold: zone.bold,
      align: zone.align,
      valign: "top",
      margin: 0,
    });
  }
}

/**
 * Hybrid slide: full-bleed captured PNG background + editable text zones on
 * top. The text is NEVER part of the image (the capture masks text layers).
 */
function buildDesignFidelitySlide(
  s: PptxGenJS.Slide,
  dataUrl: string,
  zones: TextZone[]
): void {
  s.addImage({
    data: dataUrl,
    x: 0,
    y: 0,
    w: SLIDE_WIDTH_IN,
    h: SLIDE_HEIGHT_IN,
    sizing: { type: "cover", w: SLIDE_WIDTH_IN, h: SLIDE_HEIGHT_IN },
  });
  addTextZones(s, zones);
}

/**
 * Native slide: template background + canvas shapes/images rebuilt from the
 * slide elements + editable text zones. No full-page image.
 */
function buildNativeSlide(
  s: PptxGenJS.Slide,
  slide: Slide,
  template: Template | undefined,
  zones: TextZone[]
): void {
  s.background = { color: stripHash(template?.colors.background || "FFFFFF") };

  for (const element of slide.elements ?? []) {
    if (element.type === "text" || element.type === "table") {
      // Text blocks are the textZones' job (single source of truth).
      continue;
    }
    if (element.type === "shape") {
      addNativeShape(s, element);
    } else if (element.type === "image") {
      if (element.content) {
        s.addImage({
          data: element.content,
          x: `${element.x}%`,
          y: `${element.y}%`,
          w: `${element.w}%`,
          h: `${element.h}%`,
        });
      }
    }
    // chronology / diagram / powerbi: decorative in native mode — the editable
    // text they contain is already carried by the textZones.
  }

  addTextZones(s, zones);
}

/* ------------------------------------------------------------------ */
/* Transitions / animations (reused from lib/pptxExport.ts)            */
/* ------------------------------------------------------------------ */

interface SlideAnimInfo {
  transition: HtmlPptxTransition;
  elementCount: number;
}

/**
 * Injects `generateTransitionXml` / `generateTimingXml` output into each
 * slide of the generated zip (same post-processing as `lib/pptxExport.ts`).
 */
async function injectTransitions(
  arrayBuffer: ArrayBuffer,
  animInfos: SlideAnimInfo[]
): Promise<Blob> {
  const zip = await JSZip.loadAsync(arrayBuffer);

  for (let i = 0; i < animInfos.length; i++) {
    const slidePath = `ppt/slides/slide${i + 1}.xml`;
    const slideXml = await zip.file(slidePath)?.async("text");
    if (!slideXml) continue;

    const animInfo = animInfos[i];
    let extraXml = generateTransitionXml(animInfo.transition);
    if (animInfo.elementCount > 0) {
      const shapeIds = Array.from({ length: animInfo.elementCount }, (_, j) => j + 2);
      extraXml += generateTimingXml(shapeIds, i);
    }
    zip.file(slidePath, slideXml.replace("</p:sld>", `${extraXml}</p:sld>`));
  }

  return zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Exports a presentation to a `.pptx` file with the two-mode HTML-first
 * engine and triggers the download (unless `options.download === false`).
 *
 * Default mode `"design-fidelity"`: captured HTML background (full-bleed PNG,
 * text masked out) + editable PowerPoint text zones from
 * `lib/htmlExport/textZones.ts`. `"native"`: PptxGenJS shapes + text only.
 *
 * In both modes: slide notes are exported to the PowerPoint notes, and
 * transitions/animations reuse `generateTransitionXml` / `generateTimingXml`
 * of `lib/pptxExport.ts` (which stays untouched).
 *
 * If a capture fails, the slide falls back to the native mode and a
 * `capture-fallback` notification is emitted through
 * `options.onNotification`; if every capture failed the export runs fully
 * native (`native-fallback` notification). The export never rejects because
 * of a capture failure.
 *
 * @returns the effective mode, the sanitized file name, the `.pptx` blob and
 *   every emitted notification.
 */
export async function exportHtmlPptx(
  presentation: Presentation,
  template?: Template,
  options: ExportHtmlPptxOptions = {}
): Promise<HtmlPptxExportResult> {
  const requestedMode: HtmlPptxExportMode = options.mode ?? "design-fidelity";
  const notifications: HtmlPptxNotification[] = [];
  const notify = (notification: HtmlPptxNotification): void => {
    notifications.push(notification);
    options.onNotification?.(notification);
  };

  // Capture pass (hybrid mode only). Captures run sequentially to keep the
  // off-screen mounts light; failures never throw — they notify + fall back.
  const captureResults: Array<string | null> = [];
  if (requestedMode === "design-fidelity" && template) {
    const capture =
      options.captureSlide ??
      ((slide: Slide, tpl: Template) =>
        tryCaptureSlide(slide, tpl, { mode: "decor-only", ...options.capture }).then(
          (outcome) => {
            if (outcome.ok) return outcome.dataUrl;
            throw outcome.error;
          }
        ));

    for (const [slideIdx, slide] of presentation.slides.entries()) {
      try {
        captureResults.push(await capture(slide, template));
      } catch (err) {
        const captureError: CaptureSlideError | undefined =
          err && typeof err === "object" && "reason" in err
            ? (err as CaptureSlideError)
            : undefined;
        notify({
          type: "capture-fallback",
          slideIndex: slideIdx,
          ...(captureError ? { error: captureError } : {}),
          message: `Slide ${slideIdx + 1}: capture of the HTML render failed (${captureError?.reason ?? errorMessage(err)}); rebuilt in native editable mode.`,
        });
        captureResults.push(null);
      }
    }
  }

  const anyCaptured = captureResults.some((result) => result !== null);
  const slideModes: Array<HtmlPptxExportMode> = [];
  if (requestedMode === "design-fidelity" && template && anyCaptured) {
    for (const result of captureResults) {
      slideModes.push(result !== null ? "design-fidelity" : "native");
    }
  } else {
    presentation.slides.forEach(() => slideModes.push("native"));
    if (requestedMode === "design-fidelity" && presentation.slides.length > 0) {
      notify({
        type: "native-fallback",
        message:
          "No slide could be captured (html-to-image / fonts failure); the whole export was rebuilt in native editable mode.",
      });
    }
  }

  // Build the deck.
  const pptx = new PptxGenJS();
  pptx.title = presentation.title;
  pptx.subject = presentation.subtitle || "";
  pptx.author = presentation.author || "MyBeautifulPresentation";
  pptx.company = "MyBeautifulPresentation";
  pptx.layout = "LAYOUT_16x9";

  const animInfos: SlideAnimInfo[] = [];

  for (const [slideIdx, slide] of presentation.slides.entries()) {
    const s = pptx.addSlide();
    const zones = getTextZones(slide, template);
    const dataUrl = captureResults[slideIdx] ?? null;

    if (slideModes[slideIdx] === "design-fidelity" && dataUrl) {
      buildDesignFidelitySlide(s, dataUrl, zones);
    } else {
      buildNativeSlide(s, slide, template, zones);
    }

    // Speaker notes — exported in BOTH modes.
    if (slide.notes) {
      s.addNotes(slide.notes);
    }

    // Every text zone is a PowerPoint shape: one animation target per zone,
    // exactly like the element-driven count of lib/pptxExport.ts.
    animInfos.push({
      transition: resolveTransition(options.transition, slideIdx),
      elementCount: zones.filter((zone) => zone.text.trim() !== "").length,
    });
  }

  // Write, inject transitions/animations (generateTransitionXml/generateTimingXml
  // of lib/pptxExport.ts), then download with a sanitized file name.
  const arrayBuffer = await pptx.write({ outputType: "arraybuffer" });
  const blob = await injectTransitions(arrayBuffer as ArrayBuffer, animInfos);

  const baseFileName = options.fileName
    ? sanitizeFileName(options.fileName)
    : sanitizeFileName(presentation.title);
  const fileName = withExtension(baseFileName);

  if (options.download !== false) {
    if (options.onDownload) {
      options.onDownload(blob, fileName);
    } else if (typeof document !== "undefined") {
      downloadBlob(blob, fileName);
    }
  }

  return {
    mode:
      slideModes.length > 0 && slideModes.every((m) => m === "native")
        ? "native"
        : requestedMode,
    slideModes,
    fileName: baseFileName,
    blob,
    notifications,
  };
}

/* ------------------------------------------------------------------ */
/* Convenience aliases                                                 */
/* ------------------------------------------------------------------ */

/** Alias of {@link exportHtmlPptx}. */
export const exportHtmlToPptx = exportHtmlPptx;
/** Alias of {@link exportHtmlPptx}. */
export const exportPresentationToPptx = exportHtmlPptx;
/** Alias of {@link HtmlPptxExportMode}. */
export type ExportMode = HtmlPptxExportMode;
/** Alias of {@link sanitizeFileName}. */
export const sanitizePptxFileName = sanitizeFileName;
