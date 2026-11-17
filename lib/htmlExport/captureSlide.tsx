/**
 * captureSlide.tsx — off-screen slide render → PNG data-URL (html-to-image).
 *
 * Phase 1 of the html-first slide design plan (`.tidet/plans/
 * 2026-10-30T09-08-42--html-first-slide-design.md`), work unit "captureSlide
 * HTML to PNG". The capture pipeline:
 *
 *   1. mounts `<SlideEngine/>` in an off-screen {@link CAPTURE_WIDTH} ×
 *      {@link CAPTURE_HEIGHT} (1280 × 720) frame appended to `document.body`;
 *   2. waits for `document.fonts.ready` (via `./fonts`) and for every `<img>`
 *      of the render to be loaded (or errored);
 *   3. captures the 1280 × 720 frame as a PNG data-URL through
 *      `html-to-image.toPng({ pixelRatio: 3 })` (3840 × 2160 output).
 *
 * Decor-only capture (hybrid "design fidèle" export): this wrapper itself masks
 * the text layers before the capture — the title, the content blocks and the
 * `text` / `table` slide elements, all located through the single source of
 * truth `lib/htmlExport/textZones.ts` — WITHOUT touching
 * `app/components/SlideEngine.tsx`. Masked nodes get the
 * {@link DECOR_ONLY_ATTRIBUTE} marker and are hidden (`visibility: hidden`, so
 * the surrounding decor keeps its layout); the PNG then contains the decor
 * only, and the text is recreated as native PowerPoint text boxes by
 * `lib/htmlExport/exportHtmlPptx.ts` (text is never flattened into an image).
 *
 * Error contract: this module NEVER raises an unhandled exception. Every
 * failure — capture timeout, font failure / font timeout, image loading
 * timeout, html-to-image error, mount error — rejects the returned promise
 * with a typed {@link CaptureSlideError} whose `reason` says which step
 * failed. {@link tryCaptureSlide} offers the same as a typed, non-throwing
 * outcome.
 */

import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { toPng } from "html-to-image";
import { SlideRenderer } from "@/app/components/SlideRenderer";
import type { Slide, SlideElement } from "@/app/types/presentation";
import type { Template } from "@/app/types/template";
import { getTextZones } from "./textZones";
import { DEFAULT_FONTS_TIMEOUT_MS, waitForFontsReady } from "./fonts";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Off-screen capture frame width, in CSS pixels. */
export const CAPTURE_WIDTH = 1280;
/** Off-screen capture frame height, in CSS pixels (16:9). */
export const CAPTURE_HEIGHT = 720;
/** `pixelRatio` passed to `html-to-image.toPng` (3840 × 2160 PNG). */
export const DEFAULT_PIXEL_RATIO = 3;
/** Global deadline for one slide capture, in ms. */
export const DEFAULT_CAPTURE_TIMEOUT_MS = 15000;
/** Deadline for `<img>` loading before the capture fails, in ms. */
export const DEFAULT_IMAGES_TIMEOUT_MS = 5000;

/**
 * Marker attribute of the decor-only masking: set on the capture frame, on the
 * captured slide root and on every text node the wrapper masks.
 */
export const DECOR_ONLY_ATTRIBUTE = "data-export-decor-only";

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

/**
 * - `"full"`: capture the complete render (nothing masked).
 * - `"decor-only"`: text layers are masked first (hybrid background PNG).
 */
export type CaptureMode = "full" | "decor-only";

/** Which capture step failed. */
export type CaptureSlideErrorReason =
  | "timeout"
  | "fonts-timeout"
  | "fonts-error"
  | "images-timeout"
  | "capture-error"
  | "mount-error"
  | "no-document";

export interface CaptureSlideOptions {
  /** Capture mode, default `"full"`. `"decor-only"` masks the text layers. */
  mode?: CaptureMode;
  /** Convenience alias for `mode: "decor-only"`. */
  decorOnly?: boolean;
  /** `pixelRatio` for `toPng`, default {@link DEFAULT_PIXEL_RATIO} (3). */
  pixelRatio?: number;
  /** Global capture deadline in ms, default {@link DEFAULT_CAPTURE_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** `document.fonts.ready` deadline in ms, default `DEFAULT_FONTS_TIMEOUT_MS`. */
  fontsTimeoutMs?: number;
  /** Image loading deadline in ms, default {@link DEFAULT_IMAGES_TIMEOUT_MS}. */
  imagesTimeoutMs?: number;
  /**
   * When `true`, a font timeout / font error does not fail the capture (the
   * PNG is produced with whatever fonts are available). Default `false`:
   * font problems reject with `"fonts-timeout"` / `"fonts-error"` so the
   * caller can fall back to the native export mode.
   */
  allowFontFallback?: boolean;
  /** Extra settle delay (ms) after mounting the React render, default 0. */
  settleMs?: number;
}

/** Typed, non-throwing outcome of {@link tryCaptureSlide}. */
export type CaptureSlideOutcome =
  | { ok: true; dataUrl: string }
  | { ok: false; error: CaptureSlideError };

/**
 * Typed capture failure: `reason` identifies the failing step. This is the
 * ONLY error type {@link captureSlideToPng} rejects with (unknown errors are
 * normalized through {@link asCaptureSlideError}).
 */
export class CaptureSlideError extends Error {
  readonly reason: CaptureSlideErrorReason;
  readonly cause?: unknown;

  constructor(reason: CaptureSlideErrorReason, message: string, cause?: unknown) {
    super(message);
    this.name = "CaptureSlideError";
    this.reason = reason;
    this.cause = cause;
  }
}

/* ------------------------------------------------------------------ */
/* Error helpers                                                       */
/* ------------------------------------------------------------------ */

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Normalizes any thrown value into a typed {@link CaptureSlideError}. */
export function asCaptureSlideError(err: unknown): CaptureSlideError {
  if (err instanceof CaptureSlideError) return err;
  return new CaptureSlideError("capture-error", `Slide capture failed: ${messageOf(err)}`, err);
}

/* ------------------------------------------------------------------ */
/* Small async helpers                                                 */
/* ------------------------------------------------------------------ */

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Races `promise` against a deadline. `timeoutMs <= 0` disables the deadline.
 * The timer is always cleared once the promise settles.
 */
function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  makeError: () => CaptureSlideError
): Promise<T> {
  if (!(timeoutMs > 0)) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(makeError());
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/* ------------------------------------------------------------------ */
/* Off-screen mounting                                                 */
/* ------------------------------------------------------------------ */

/**
 * Off-screen container: laid out for real (so fonts, images and geometry are
 * computed) but kept out of the viewport. The capture itself targets the inner
 * {@link createCaptureFrame} element, so the container's `opacity: 0` never
 * leaks into the PNG.
 */
function createOffscreenContainer(): HTMLDivElement {
  const div = document.createElement("div");
  div.style.position = "fixed";
  div.style.top = "0";
  div.style.left = "-100000px";
  div.style.width = `${CAPTURE_WIDTH}px`;
  div.style.height = `${CAPTURE_HEIGHT}px`;
  div.style.overflow = "hidden";
  div.style.opacity = "0";
  div.style.pointerEvents = "none";
  div.style.zIndex = "-1";
  document.body.appendChild(div);
  return div;
}

/**
 * The 1280 × 720 capture frame: the node handed to `html-to-image.toPng`.
 * Its explicit pixel size makes the captured surface exactly 1280 × 720 CSS
 * pixels (3840 × 2160 once `pixelRatio: 3` is applied).
 */
function createCaptureFrame(): HTMLDivElement {
  const frame = document.createElement("div");
  frame.style.position = "relative";
  frame.style.width = `${CAPTURE_WIDTH}px`;
  frame.style.height = `${CAPTURE_HEIGHT}px`;
  frame.style.overflow = "hidden";
  return frame;
}

/* ------------------------------------------------------------------ */
/* Image loading                                                       */
/* ------------------------------------------------------------------ */

function isImageSettled(img: HTMLImageElement): boolean {
  return !img.getAttribute("src") || img.complete;
}

/**
 * Resolves once every `<img>` inside `root` has settled (loaded or errored).
 * Rejects with `CaptureSlideError("images-timeout")` when at least one image
 * is still pending after `timeoutMs` (`timeoutMs <= 0` disables the deadline).
 */
export function waitForSlideImages(root: HTMLElement, timeoutMs: number): Promise<void> {
  const pending = Array.from(root.querySelectorAll("img")).filter(
    (img) => img instanceof HTMLImageElement && !isImageSettled(img)
  );
  if (pending.length === 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let remaining = pending.length;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const listeners: Array<() => void> = [];

    const cleanup = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      for (const off of listeners) off();
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(
          new CaptureSlideError(
            "images-timeout",
            `Timed out after ${timeoutMs}ms waiting for ${pending.length} slide image(s) to load`
          )
        );
      }, timeoutMs);
    }

    const onImageSettled = () => {
      remaining -= 1;
      if (remaining > 0 || settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    for (const img of pending) {
      img.addEventListener("load", onImageSettled, { once: true });
      img.addEventListener("error", onImageSettled, { once: true });
      listeners.push(() => {
        img.removeEventListener("load", onImageSettled);
        img.removeEventListener("error", onImageSettled);
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Decor-only masking (done by this wrapper, never by SlideEngine)      */
/* ------------------------------------------------------------------ */

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function approx(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.01;
}

/**
 * Innermost elements whose text equals `text` (whitespace-insensitive). The
 * innermost text container is masked, never its decorative ancestors.
 */
function findInnermostByText(root: HTMLElement, text: string): HTMLElement[] {
  const target = normalizeText(text);
  if (!target) return [];
  const matches: HTMLElement[] = [];
  for (const node of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    if (normalizeText(node.textContent) !== target) continue;
    const hasSameTextChild = Array.from(node.children).some(
      (child) => normalizeText(child.textContent) === target
    );
    if (!hasSameTextChild) matches.push(node);
  }
  return matches;
}

/**
 * The absolutely-positioned wrapper `SlideEngine` renders for a canvas element
 * (`left/top/width/height` in %, see the `slide.elements` branch of
 * app/components/SlideEngine.tsx). Located from the element geometry carried by
 * the text zones. Returns the innermost wrapper when several nodes share the
 * same rectangle.
 */
function findElementWrappers(root: HTMLElement, element: SlideElement): HTMLElement[] {
  const matches = Array.from(root.querySelectorAll<HTMLElement>("*")).filter((node) => {
    const style = node.style;
    return (
      approx(parseFloat(style.left), element.x) &&
      approx(parseFloat(style.top), element.y) &&
      approx(parseFloat(style.width), element.w) &&
      approx(parseFloat(style.height), element.h)
    );
  });
  return matches.filter((node) => {
    return !matches.some((other) => other !== node && node.contains(other));
  });
}

/**
 * Text nodes to mask for a decor-only capture, identified through
 * {@link getTextZones} (the single source of truth for text blocks):
 *   - the title and the content blocks (located by their zone text);
 *   - every `text` / `table` slide element (its text node, or its wrapper for
 *     tables whose cell text is a re-layout of the raw content string).
 * Nodes already carrying {@link DECOR_ONLY_ATTRIBUTE} are included too, so a
 * future engine-level marker is honoured as well.
 */
export function collectDecorMaskTargets(
  root: HTMLElement,
  slide: Slide,
  template?: Template
): HTMLElement[] {
  const targets = new Set<HTMLElement>();

  for (const zone of getTextZones(slide, template)) {
    if (normalizeText(zone.text) === "") continue;
    for (const el of findInnermostByText(root, zone.text)) {
      targets.add(el);
    }
  }

  for (const element of slide.elements ?? []) {
    if (element.type !== "text" && element.type !== "table") continue;
    for (const wrapper of findElementWrappers(root, element)) {
      targets.add(wrapper);
    }
  }

  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[${DECOR_ONLY_ATTRIBUTE}]`))) {
    targets.add(el);
  }

  return Array.from(targets);
}

/**
 * Masks the text layers of an already-mounted slide render for a decor-only
 * capture. Marks each masked node with {@link DECOR_ONLY_ATTRIBUTE} and hides
 * it (`visibility: hidden` + `opacity: 0`, so the surrounding decor keeps its
 * layout). Returns the number of masked nodes.
 */
export function applyDecorOnlyMask(
  root: HTMLElement,
  slide: Slide,
  template?: Template
): number {
  const targets = collectDecorMaskTargets(root, slide, template);
  for (const el of targets) {
    el.setAttribute(DECOR_ONLY_ATTRIBUTE, "true");
    el.style.visibility = "hidden";
    el.style.opacity = "0";
  }
  root.setAttribute(DECOR_ONLY_ATTRIBUTE, "true");
  return targets.length;
}

/* ------------------------------------------------------------------ */
/* Capture                                                             */
/* ------------------------------------------------------------------ */

interface MountedCaptureConfig {
  decorOnly: boolean;
  pixelRatio: number;
  fontsTimeoutMs: number;
  imagesTimeoutMs: number;
  allowFontFallback: boolean;
  settleMs: number;
}

/**
 * Capture of an already-mounted render: settle → fonts → images →
 * (decor-only masking) → `toPng({ pixelRatio })`.
 */
async function captureMountedFrame(
  frame: HTMLElement,
  slide: Slide,
  template: Template,
  config: MountedCaptureConfig
): Promise<string> {
  if (config.settleMs > 0) {
    await delay(config.settleMs);
  }

  const fonts = await waitForFontsReady({ timeoutMs: config.fontsTimeoutMs });
  if (!fonts.ready && !config.allowFontFallback && fonts.reason !== "no-document-fonts") {
    throw new CaptureSlideError(
      fonts.reason === "timeout" ? "fonts-timeout" : "fonts-error",
      `Slide capture aborted before rendering: web fonts were not ready (${fonts.reason})`
    );
  }

  await waitForSlideImages(frame, config.imagesTimeoutMs);

  if (config.decorOnly) {
    applyDecorOnlyMask(frame, slide, template);
  }

  const dataUrl = await toPng(frame, { pixelRatio: config.pixelRatio }).catch((err: unknown) => {
    throw new CaptureSlideError(
      "capture-error",
      `html-to-image.toPng failed: ${messageOf(err)}`,
      err
    );
  });

  if (!dataUrl.startsWith("data:")) {
    throw new CaptureSlideError("capture-error", "html-to-image.toPng did not return a data-URL");
  }
  return dataUrl;
}

/**
 * Captures a slide as a PNG data-URL.
 *
 * Mounts `<SlideEngine/>` off-screen in a 1280 × 720 frame, waits for
 * `document.fonts.ready` and for the slide images, then calls
 * `html-to-image.toPng({ pixelRatio: 3 })` on that frame. With
 * `mode: "decor-only"` the text layers located via `lib/htmlExport/textZones.ts`
 * are masked first (hybrid export background); `app/components/SlideEngine.tsx`
 * is never modified.
 *
 * @returns the PNG data-URL produced by `html-to-image.toPng`.
 * @throws {CaptureSlideError} typed rejection on any failure — timeout,
 *   fonts, images, html-to-image or mount — never an unhandled exception.
 */
export async function captureSlideToPng(
  slide: Slide,
  template: Template,
  options: CaptureSlideOptions = {}
): Promise<string> {
  const decorOnly = options.mode === "decor-only" || options.decorOnly === true;
  const pixelRatio = options.pixelRatio ?? DEFAULT_PIXEL_RATIO;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS;
  const fontsTimeoutMs = options.fontsTimeoutMs ?? DEFAULT_FONTS_TIMEOUT_MS;
  const imagesTimeoutMs = options.imagesTimeoutMs ?? DEFAULT_IMAGES_TIMEOUT_MS;

  if (typeof document === "undefined") {
    throw new CaptureSlideError(
      "no-document",
      "captureSlideToPng requires a DOM (document is undefined)"
    );
  }

  const container = createOffscreenContainer();
  if (decorOnly) {
    container.setAttribute(DECOR_ONLY_ATTRIBUTE, "true");
  }

  let root: Root | null = null;
  try {
    const frame = createCaptureFrame();
    container.appendChild(frame);

    try {
      const mountedRoot = createRoot(frame);
      root = mountedRoot;
      flushSync(() => {
        mountedRoot.render(
          <SlideRenderer slide={slide} template={template} mode="export" scale={1} />
        );
      });
    } catch (err) {
      throw new CaptureSlideError(
        "mount-error",
        `Could not mount the slide render: ${messageOf(err)}`,
        err
      );
    }

    const run = captureMountedFrame(frame, slide, template, {
      decorOnly,
      pixelRatio,
      fontsTimeoutMs,
      imagesTimeoutMs,
      allowFontFallback: options.allowFontFallback === true,
      settleMs: options.settleMs ?? 0,
    });

    try {
      return await raceWithTimeout(run, timeoutMs, () => {
        return new CaptureSlideError(
          "timeout",
          `Slide capture timed out after ${timeoutMs}ms (html-to-image did not answer in time)`
        );
      });
    } catch (err) {
      throw asCaptureSlideError(err);
    } finally {
      // If the deadline abandoned `run`, its late failure must never surface
      // as an unhandled rejection.
      run.catch(() => {
        /* swallowed: the caller already received its typed error */
      });
    }
  } finally {
    if (root) {
      try {
        root.unmount();
      } catch {
        /* ignore: React may already have unmounted */
      }
    }
    container.remove();
  }
}

/** Alias of {@link captureSlideToPng}. */
export const captureSlide = captureSlideToPng;

/**
 * Non-throwing variant of {@link captureSlideToPng}: resolves with
 * `{ ok: true, dataUrl }` or `{ ok: false, error: CaptureSlideError }`.
 */
export async function tryCaptureSlide(
  slide: Slide,
  template: Template,
  options: CaptureSlideOptions = {}
): Promise<CaptureSlideOutcome> {
  try {
    return { ok: true, dataUrl: await captureSlideToPng(slide, template, options) };
  } catch (err) {
    return { ok: false, error: asCaptureSlideError(err) };
  }
}
