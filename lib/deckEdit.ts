import type { Slide, SlideLayout } from "@/app/types/presentation";

/**
 * Incremental deck editing.
 *
 * The chat never regenerates a whole presentation: the LLM returns a plan of
 * operations on the existing slides, and this module applies that plan to the
 * current deck. Keeping it pure (no React, no store, no network) is what makes
 * "rajoute une slide sur X" testable and safe.
 */

export interface DeckSlidePayload {
  title?: string;
  content?: string;
  /** Already normalized by `parseDeckEditResponse` (lib/llm.ts). */
  layout?: string;
}

export type DeckOperation =
  | { op: "add"; afterIndex?: number; slide: DeckSlidePayload }
  | { op: "update"; index: number; slide: DeckSlidePayload }
  | { op: "delete"; index: number }
  | { op: "move"; fromIndex: number; toIndex: number };

export interface DeckEditOutcome {
  slides: Slide[];
  /** Index of the last slide touched, to keep the editor on it. */
  touchedIndex: number | null;
  /** Operations that were really applied (invalid ones are dropped). */
  applied: DeckOperation[];
  /** Ids of the slides created by this edit. */
  addedIds: string[];
}

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isIndex(value: unknown, length: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < length;
}

export function applyDeckOperations(
  slides: Slide[],
  operations: DeckOperation[]
): DeckEditOutcome {
  // Never mutate the caller's array or its slide objects.
  const next: Slide[] = slides.map((slide) => ({ ...slide }));
  const applied: DeckOperation[] = [];
  const addedIds: string[] = [];
  let touchedIndex: number | null = null;

  for (const operation of operations) {
    switch (operation.op) {
      case "add": {
        const requested = operation.afterIndex;
        const afterIndex =
          typeof requested === "number" && Number.isInteger(requested) && requested >= 0
            ? Math.min(requested, next.length - 1)
            : next.length - 1;
        const insertAt = next.length === 0 ? 0 : afterIndex + 1;
        const payload = operation.slide ?? {};
        const slide: Slide = {
          id: generateUUID(),
          title: payload.title ?? "Nouvelle slide",
          content: payload.content ?? "",
          layout: (payload.layout || "title-content") as SlideLayout,
        };
        next.splice(insertAt, 0, slide);
        addedIds.push(slide.id);
        applied.push({ ...operation, afterIndex });
        touchedIndex = insertAt;
        break;
      }

      case "update": {
        if (!isIndex(operation.index, next.length)) break;
        const payload = operation.slide ?? {};
        const current = next[operation.index];
        const updated: Slide = { ...current };
        if (typeof payload.title === "string") updated.title = payload.title;
        if (typeof payload.content === "string") updated.content = payload.content;
        if (typeof payload.layout === "string" && payload.layout) {
          updated.layout = payload.layout as SlideLayout;
        }
        next[operation.index] = updated;
        applied.push(operation);
        touchedIndex = operation.index;
        break;
      }

      case "delete": {
        if (!isIndex(operation.index, next.length)) break;
        next.splice(operation.index, 1);
        applied.push(operation);
        touchedIndex = next.length === 0 ? null : Math.min(operation.index, next.length - 1);
        break;
      }

      case "move": {
        if (!isIndex(operation.fromIndex, next.length) || !isIndex(operation.toIndex, next.length)) {
          break;
        }
        const [moved] = next.splice(operation.fromIndex, 1);
        next.splice(operation.toIndex, 0, moved);
        applied.push(operation);
        touchedIndex = operation.toIndex;
        break;
      }

      default:
        break;
    }
  }

  return { slides: next, touchedIndex, applied, addedIds };
}
