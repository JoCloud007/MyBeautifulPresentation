import { describe, it, expect, beforeEach } from "vitest";
import {
  usePresentationStore,
  legacySlideToElements,
  normalizeLegacyElementStyles,
} from "../presentationStore";
import { Slide } from "@/app/types/presentation";

function resetStore() {
  usePresentationStore.setState({
    presentation: {
      id: "test-pres-id",
      title: "Nouvelle Présentation",
      subtitle: "",
      author: "",
      slides: [
        {
          id: "default-slide-id",
          title: "Titre de la présentation",
          content: "Sous-titre ou description",
          layout: "title",
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    currentSlideIndex: 0,
    isGenerating: false,
    storytelling: "",
  });
}

// Helper to get fresh state after actions
function getState() {
  return usePresentationStore.getState();
}

describe("presentationStore", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("initial state", () => {
    it("has a default presentation with one slide", () => {
      const state = getState();
      expect(state.presentation).not.toBeNull();
      expect(state.presentation!.slides).toHaveLength(1);
      expect(state.currentSlideIndex).toBe(0);
      expect(state.isGenerating).toBe(false);
      expect(state.storytelling).toBe("");
    });

    it("default slide has title layout", () => {
      expect(getState().presentation!.slides[0].layout).toBe("title");
    });
  });

  describe("setCurrentSlide", () => {
    it("updates currentSlideIndex", () => {
      getState().addSlide();
      getState().setCurrentSlide(1);
      expect(getState().currentSlideIndex).toBe(1);
    });

    it("can set index to 0", () => {
      getState().addSlide();
      getState().setCurrentSlide(1);
      getState().setCurrentSlide(0);
      expect(getState().currentSlideIndex).toBe(0);
    });
  });

  describe("addSlide", () => {
    it("inserts a new slide after current index", () => {
      getState().addSlide();
      expect(getState().presentation!.slides).toHaveLength(2);
      expect(getState().currentSlideIndex).toBe(1);
    });

    it("accepts partial slide overrides", () => {
      getState().addSlide({ title: "Custom", layout: "two-column" });
      const newSlide = getState().presentation!.slides[1];
      expect(newSlide.title).toBe("Custom");
      expect(newSlide.layout).toBe("two-column");
    });

    it("adds multiple slides in sequence", () => {
      getState().addSlide();
      getState().addSlide();
      getState().addSlide();
      expect(getState().presentation!.slides).toHaveLength(4);
    });

    it("new slide has a unique id", () => {
      getState().addSlide();
      const ids = getState().presentation!.slides.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("updateSlide", () => {
    it("updates slide title", () => {
      getState().updateSlide(0, { title: "Updated" });
      expect(getState().presentation!.slides[0].title).toBe("Updated");
    });

    it("updates slide content", () => {
      getState().updateSlide(0, { content: "New content" });
      expect(getState().presentation!.slides[0].content).toBe("New content");
    });

    it("updates updatedAt timestamp", () => {
      const before = getState().presentation!.updatedAt;
      getState().updateSlide(0, { title: "Updated" });
      expect(getState().presentation!.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it("does not affect other slides", () => {
      getState().addSlide({ title: "Second" });
      getState().updateSlide(0, { title: "First Updated" });
      expect(getState().presentation!.slides[1].title).toBe("Second");
    });
  });

  describe("removeSlide", () => {
    it("removes the slide at given index", () => {
      getState().addSlide({ title: "ToRemove" });
      getState().removeSlide(1);
      expect(getState().presentation!.slides).toHaveLength(1);
      expect(getState().presentation!.slides[0].title).not.toBe("ToRemove");
    });

    it("adjusts currentSlideIndex when removing after current", () => {
      getState().addSlide();
      getState().addSlide();
      getState().setCurrentSlide(0);
      getState().removeSlide(2);
      expect(getState().currentSlideIndex).toBe(0);
    });

    it("adjusts currentSlideIndex when removing before current", () => {
      getState().addSlide();
      getState().addSlide();
      getState().setCurrentSlide(2);
      getState().removeSlide(0);
      expect(getState().currentSlideIndex).toBe(1);
    });

    it("adjusts index to last slide when removing last slide", () => {
      getState().addSlide();
      getState().setCurrentSlide(1);
      getState().removeSlide(1);
      expect(getState().currentSlideIndex).toBe(0);
    });

    it("does not go below 0 when removing the only slide", () => {
      getState().removeSlide(0);
      expect(getState().currentSlideIndex).toBe(0);
    });
  });

  describe("duplicateSlide", () => {
    it("creates a copy of the slide", () => {
      getState().updateSlide(0, { title: "Original" });
      getState().duplicateSlide(0);
      expect(getState().presentation!.slides).toHaveLength(2);
      expect(getState().presentation!.slides[1].title).toBe("Original");
    });

    it("gives duplicated slide a new id", () => {
      const originalId = getState().presentation!.slides[0].id;
      getState().duplicateSlide(0);
      const newId = getState().presentation!.slides[1].id;
      expect(newId).not.toBe(originalId);
    });

    it("moves current index to duplicated slide", () => {
      getState().duplicateSlide(0);
      expect(getState().currentSlideIndex).toBe(1);
    });

    it("does nothing for out-of-range index", () => {
      getState().duplicateSlide(99);
      expect(getState().presentation!.slides).toHaveLength(1);
    });
  });

  describe("reorderSlides", () => {
    it("moves slide from one index to another", () => {
      getState().addSlide({ title: "A" });
      getState().addSlide({ title: "B" });
      getState().reorderSlides(0, 2);
      const titles = getState().presentation!.slides.map((s) => s.title);
      expect(titles[2]).toBe("Titre de la présentation");
    });

    it("updates updatedAt", () => {
      getState().addSlide();
      const before = getState().presentation!.updatedAt;
      getState().reorderSlides(0, 1);
      expect(getState().presentation!.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe("createFromStory", () => {
    it("creates a new presentation from slides array", () => {
      const slides: Slide[] = [
        { id: "s1", title: "Intro", content: "Welcome", layout: "title" },
        { id: "s2", title: "Details", content: "More info", layout: "title-content" },
      ];
      getState().createFromStory("Story Title", slides);
      expect(getState().presentation!.title).toBe("Story Title");
      expect(getState().presentation!.slides).toHaveLength(2);
      expect(getState().currentSlideIndex).toBe(0);
    });

    it("sets createdAt and updatedAt", () => {
      const before = Date.now();
      getState().createFromStory("T", []);
      const after = Date.now();
      expect(getState().presentation!.createdAt).toBeGreaterThanOrEqual(before);
      expect(getState().presentation!.createdAt).toBeLessThanOrEqual(after);
    });
  });

  describe("updatePresentationMeta", () => {
    it("updates title", () => {
      getState().updatePresentationMeta({ title: "New Title" });
      expect(getState().presentation!.title).toBe("New Title");
    });

    it("updates subtitle", () => {
      getState().updatePresentationMeta({ subtitle: "My Subtitle" });
      expect(getState().presentation!.subtitle).toBe("My Subtitle");
    });

    it("updates author", () => {
      getState().updatePresentationMeta({ author: "John Doe" });
      expect(getState().presentation!.author).toBe("John Doe");
    });

    it("updates updatedAt", () => {
      const before = getState().presentation!.updatedAt;
      getState().updatePresentationMeta({ title: "T" });
      expect(getState().presentation!.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe("setSlideLayout", () => {
    it("changes the layout of a slide", () => {
      getState().setSlideLayout(0, "two-column");
      expect(getState().presentation!.slides[0].layout).toBe("two-column");
    });

    it("updates updatedAt", () => {
      const before = getState().presentation!.updatedAt;
      getState().setSlideLayout(0, "content-only");
      expect(getState().presentation!.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe("setStorytelling", () => {
    it("stores storytelling text", () => {
      getState().setStorytelling("Once upon a time...");
      expect(getState().storytelling).toBe("Once upon a time...");
    });
  });

  describe("setGenerating", () => {
    it("toggles generating flag", () => {
      getState().setGenerating(true);
      expect(getState().isGenerating).toBe(true);
      getState().setGenerating(false);
      expect(getState().isGenerating).toBe(false);
    });
  });

  describe("resetPresentation", () => {
    it("resets to default state", () => {
      getState().addSlide();
      getState().setStorytelling("some text");
      getState().setCurrentSlide(1);
      getState().resetPresentation();
      expect(getState().presentation!.slides).toHaveLength(1);
      expect(getState().currentSlideIndex).toBe(0);
      expect(getState().storytelling).toBe("");
    });
  });

  describe("legacySlideToElements", () => {
    it("does not hard-code colors so text inherits the theme", () => {
      const elements = legacySlideToElements({
        id: "s1",
        title: "T",
        content: "Body",
        layout: "title-content",
      });
      expect(elements.length).toBeGreaterThan(0);
      for (const el of elements) {
        expect(el.style?.color).toBeUndefined();
        expect(el.style?.backgroundColor).toBeUndefined();
      }
    });

    it("still applies layout and typography", () => {
      const elements = legacySlideToElements({
        id: "s1",
        title: "T",
        content: "Body",
        layout: "title-content",
      });
      expect(elements[0].style?.fontSize).toBe(36);
      expect(elements[0].style?.fontWeight).toBe(700);
    });

    it("uses font sizes readable at slide scale", () => {
      // Canvas is 800×450; a body font must stay well above the legacy 14px
      // (3.1% of slide height) which rendered as microscopic text.
      const elements = legacySlideToElements({
        id: "s1",
        title: "Title",
        content: "Left | Right",
        layout: "two-column",
      });
      const SLIDE_HEIGHT = 450;
      for (const el of elements) {
        expect(el.style?.fontSize).toBeGreaterThanOrEqual(20);
        expect((el.style!.fontSize! / SLIDE_HEIGHT) * 100).toBeGreaterThanOrEqual(4);
      }
    });
  });

  describe("normalizeLegacyElementStyles", () => {
    const makePresentation = (elements: Slide["elements"]): Parameters<typeof normalizeLegacyElementStyles>[0] => ({
      id: "p1",
      title: "P",
      slides: [{ id: "s1", title: "T", content: "C", layout: "title-content", elements }],
      createdAt: 0,
      updatedAt: 0,
    });

    it("strips the historical hard-coded palette from text", () => {
      const pres = makePresentation([
        {
          id: "e1",
          type: "text",
          x: 0,
          y: 0,
          w: 50,
          h: 10,
          content: "a",
          style: { color: "#1e293b", backgroundColor: "#f8fafc" },
        },
        {
          id: "e2",
          type: "text",
          x: 0,
          y: 0,
          w: 50,
          h: 10,
          content: "b",
          style: { color: "#64748b" },
        },
        {
          id: "e3",
          type: "text",
          x: 0,
          y: 0,
          w: 50,
          h: 10,
          content: "c",
          style: { color: "#334155" },
        },
      ]);
      const result = normalizeLegacyElementStyles(pres);
      for (const el of result.slides[0].elements!) {
        expect(el.style?.color).toBeUndefined();
        expect(el.style?.backgroundColor).toBeUndefined();
      }
    });

    it("strips legacy shape background and border colors", () => {
      const pres = makePresentation([
        {
          id: "e1",
          type: "shape",
          x: 0,
          y: 0,
          w: 50,
          h: 10,
          style: { backgroundColor: "#e2e8f0", borderColor: "#cbd5e1" },
        },
      ]);
      const result = normalizeLegacyElementStyles(pres);
      expect(result.slides[0].elements![0].style?.backgroundColor).toBeUndefined();
      expect(result.slides[0].elements![0].style?.borderColor).toBeUndefined();
    });

    it("preserves user-chosen colors", () => {
      const pres = makePresentation([
        {
          id: "e1",
          type: "text",
          x: 0,
          y: 0,
          w: 50,
          h: 10,
          content: "a",
          style: { color: "#ff0000", backgroundColor: "#00ff00" },
        },
      ]);
      const result = normalizeLegacyElementStyles(pres);
      expect(result.slides[0].elements![0].style?.color).toBe("#ff0000");
      expect(result.slides[0].elements![0].style?.backgroundColor).toBe("#00ff00");
    });

    it("preserves layout and typography fields", () => {
      const pres = makePresentation([
        {
          id: "e1",
          type: "text",
          x: 5,
          y: 6,
          w: 50,
          h: 10,
          content: "a",
          // 24 is not a legacy default → must be preserved untouched.
          style: { fontSize: 24, fontWeight: 700, textAlign: "center" },
        },
      ]);
      const result = normalizeLegacyElementStyles(pres);
      const style = result.slides[0].elements![0].style!;
      expect(style.fontSize).toBe(24);
      expect(style.fontWeight).toBe(700);
      expect(style.textAlign).toBe("center");
    });

    it("upgrades legacy undersized font sizes on text elements", () => {
      const pres = makePresentation([
        {
          id: "e1",
          type: "text",
          x: 0,
          y: 0,
          w: 50,
          h: 10,
          content: "title",
          style: { fontSize: 28 },
        },
        {
          id: "e2",
          type: "text",
          x: 0,
          y: 0,
          w: 50,
          h: 10,
          content: "subtitle",
          style: { fontSize: 18 },
        },
        {
          id: "e3",
          type: "text",
          x: 0,
          y: 0,
          w: 50,
          h: 10,
          content: "body",
          style: { fontSize: 14 },
        },
      ]);
      const sizes = normalizeLegacyElementStyles(pres).slides[0].elements!.map(
        (el) => el.style?.fontSize
      );
      expect(sizes).toEqual([36, 22, 20]);
    });

    it("does not rewrite a size the user picked after the deck was migrated", () => {
      const pres = makePresentation([
        {
          id: "e1",
          type: "text",
          x: 0,
          y: 0,
          w: 50,
          h: 10,
          content: "a",
          style: { fontSize: 14 },
        },
      ]);

      // First pass migrates the legacy deck and marks it as normalized.
      const migrated = normalizeLegacyElementStyles(pres);
      expect(migrated.slides[0].elements![0].style?.fontSize).toBe(20);
      expect(migrated.legacyStylesNormalized).toBe(true);

      // The user then explicitly picks 14 in the properties panel.
      migrated.slides[0].elements![0].style!.fontSize = 14;

      // A later normalization must leave that deliberate choice untouched.
      const again = normalizeLegacyElementStyles(migrated);
      expect(again.slides[0].elements![0].style?.fontSize).toBe(14);
    });

    it("does not touch font sizes of non-text elements", () => {
      const pres = makePresentation([
        { id: "e1", type: "shape", x: 0, y: 0, w: 10, h: 10, style: { fontSize: 14 } },
      ]);
      const result = normalizeLegacyElementStyles(pres);
      expect(result.slides[0].elements![0].style?.fontSize).toBe(14);
    });

    it("is applied on setPresentation", () => {
      getState().setPresentation({
        id: "p2",
        title: "P2",
        slides: [
          {
            id: "s1",
            title: "T",
            content: "C",
            layout: "title-content",
            elements: [
              { id: "e1", type: "text", x: 0, y: 0, w: 50, h: 10, content: "a", style: { color: "#1e293b" } },
            ],
          },
        ],
        createdAt: 0,
        updatedAt: 0,
      });
      const els = getState().presentation!.slides[0].elements!;
      expect(els[0].style?.color).toBeUndefined();
    });
  });

  describe("applyDeckEdit", () => {
    beforeEach(() => {
      usePresentationStore.setState({
        presentation: {
          id: "deck-id",
          title: "Stratégie Cloud",
          subtitle: "",
          author: "",
          slides: [
            { id: "s1", title: "Intro", content: "c1", layout: "title" },
            { id: "s2", title: "Défi", content: "c2", layout: "title-content" },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        currentSlideIndex: 0,
      });
    });

    it("ajoute une slide sans changer l'identité de la présentation", () => {
      const applied = getState().applyDeckEdit([
        { op: "add", slide: { title: "Risques", content: "• Conformité", layout: "title-content" } },
      ]);

      const state = getState();
      expect(applied).toHaveLength(1);
      expect(state.presentation!.id).toBe("deck-id");
      expect(state.presentation!.title).toBe("Stratégie Cloud");
      expect(state.presentation!.slides.map((s) => s.title)).toEqual([
        "Intro",
        "Défi",
        "Risques",
      ]);
      expect(state.presentation!.slides[0].id).toBe("s1");
      expect(state.currentSlideIndex).toBe(2);
    });

    it("met à jour une slide existante sans toucher aux autres", () => {
      getState().applyDeckEdit([{ op: "update", index: 1, slide: { content: "nouveau" } }]);

      const slides = getState().presentation!.slides;
      expect(slides[1]).toMatchObject({ id: "s2", title: "Défi", content: "nouveau" });
      expect(slides[0]).toMatchObject({ id: "s1", content: "c1" });
    });

    it("ne fait rien et ne renvoie rien pour un plan inutilisable", () => {
      const applied = getState().applyDeckEdit([{ op: "delete", index: 42 }]);

      expect(applied).toEqual([]);
      expect(getState().presentation!.slides).toHaveLength(2);
    });

    it("enrichit les données d'une slide gantt ajoutée", () => {
      getState().applyDeckEdit([
        {
          op: "add",
          slide: {
            title: "Planning",
            content: "Phase 1 | 2026-01-01 | 2026-03-31 | #4caf50",
            layout: "gantt",
          },
        },
      ]);

      const added = getState().presentation!.slides[2];
      expect(added.layout).toBe("gantt");
      expect(added.data?.gantt?.tasks).toHaveLength(1);
    });
  });
});
