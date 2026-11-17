/**
 * fonts.ts — font readiness helper for the HTML-first PPTX export engine.
 *
 * Two responsibilities, used by `lib/htmlExport/exportHtmlPptx.ts` /
 * `lib/htmlExport/captureSlide.tsx` (Phase 1 of the html-first slide design
 * plan):
 *
 *   1. {@link waitForFontsReady} — resolves ONLY once `document.fonts.ready`
 *      has settled, so the HTML capture never runs against half-loaded web
 *      fonts. It never blocks forever: a timeout (default {@link
 *      DEFAULT_FONTS_TIMEOUT_MS}) races the font loading and resolves
 *      explicitly (it does NOT reject), so the caller can always proceed to
 *      capture with whatever fonts are available.
 *
 *   2. {@link getThemeFontFaces} — exposes the template's `fonts.heading` and
 *      `fonts.body` as single PowerPoint `fontFace` names (first family of the
 *      CSS font stack, quotes stripped), ready to inject into the `addText`
 *      options of the PPTX text zones produced by `lib/htmlExport/textZones.ts`.
 */

import type { Template } from "@/app/types/template";

/** Default timeout (ms) before {@link waitForFontsReady} resolves anyway. */
export const DEFAULT_FONTS_TIMEOUT_MS = 3000;

/** First family of a CSS font stack: first ','-separated entry, quotes stripped. */
export function firstFontFamily(fontStack: string | undefined): string {
  return (fontStack ?? "").split(",")[0].trim().replace(/^["']|["']$/g, "");
}

/**
 * The theme's PowerPoint `fontFace` names, one per text zone role.
 *
 * `heading` / `body` come from the template (`template.fonts.heading` /
 * `template.fonts.body`) reduced to a single family name so they can be used
 * verbatim as the `fontFace` of every PPTX `addText` call.
 */
export interface ThemeFontFaces {
  /** `fontFace` for title / heading text zones. */
  heading: string;
  /** `fontFace` for body / content text zones. */
  body: string;
}

/**
 * Declares the theme font names for the PPTX text zones: returns
 * `{ heading, body }` derived from `template.fonts.heading` /
 * `template.fonts.body`, so callers can inject them as the `fontFace` of the
 * `addText` calls built from {@link getTextZones} (lib/htmlExport/textZones.ts).
 *
 * Falls back to "Arial" when the template (or one of its font stacks) is
 * missing — same default as `lib/pptxExport.ts`.
 */
export function getThemeFontFaces(template?: Template): ThemeFontFaces {
  return {
    heading: firstFontFamily(template?.fonts?.heading) || "Arial",
    body: firstFontFamily(template?.fonts?.body) || "Arial",
  };
}

/**
 * Outcome of {@link waitForFontsReady}.
 *
 * - `ready: true`  — `document.fonts.ready` resolved before the timeout.
 * - `ready: false` — the timeout elapsed first; capture may still proceed,
 *   but some web fonts may not have been loaded when the PNG was rendered.
 */
export interface FontsReadyResult {
  ready: boolean;
  reason: "fonts-ready" | "timeout" | "fonts-error" | "no-document-fonts";
}

function fontsReadySettled(): FontsReadyResult {
  return { ready: true, reason: "fonts-ready" };
}

/**
 * Waits until `document.fonts.ready` has settled before returning, so slide
 * capture starts with all web fonts loaded.
 *
 * Contract:
 *   - resolves ONLY after `document.fonts.ready` has resolved (or after the
 *     timeout has elapsed, see below);
 *   - never blocks indefinitely: `document.fonts.ready` is raced against a
 *     timeout of `timeoutMs` ({@link DEFAULT_FONTS_TIMEOUT_MS} by default).
 *     On timeout the promise resolves explicitly with `{ ready: false, reason:
 *     "timeout" }` — it does not reject (nor hang);
 *   - resolves with `{ ready: false, reason: "no-document-fonts" }` when there
 *     is no CSS Font Loading API (non-browser environment), so the helper is
 *     safe to call from tests / SSR without hanging.
 *
 * If `document.fonts.ready` rejects, the rejection is never propagated: the
 * promise still resolves explicitly with `{ ready: false, reason:
 * "fonts-error" }`.
 */
export function waitForFontsReady(
  options: { timeoutMs?: number } = {}
): Promise<FontsReadyResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FONTS_TIMEOUT_MS;

  const fontSet = typeof document === "undefined" ? undefined : document.fonts;
  if (!fontSet || !fontSet.ready) {
    return Promise.resolve({ ready: false, reason: "no-document-fonts" });
  }

  return new Promise<FontsReadyResult>((resolve) => {
    let settled = false;
    const settle = (result: FontsReadyResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      settle({ ready: false, reason: "timeout" });
    }, timeoutMs);

    fontSet.ready.then(
      () => settle(fontsReadySettled()),
      () => settle({ ready: false, reason: "fonts-error" })
    );
  });
}
