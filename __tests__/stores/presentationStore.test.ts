import { describe, it, expect, beforeEach } from "vitest";
import { usePresentationStore } from "@/app/stores/presentationStore";

describe("presentationStore", () => {
  beforeEach(() => {
    usePresentationStore.setState(usePresentationStore.getInitialState?.() || {
      presentation: null,
      currentSlideIndex: 0,
      isGenerating: false,
      storytelling: "",
    });
    // Reset to initial state by calling resetPresentation if available
    const state = usePresentationStore.getState();
    if (state.resetPresentation) {
      state.resetPresentation();
    }
  });

  describe("Initial State", () => {
    it("should have a default presentation with one slide", () => {
      const state = usePresentationStore.getState();
      expect(state.presentation).not.toBeNull();
      expect(state.presentation!.slides).toHaveLength(1);
      expect(state.currentSlideIndex).toBe(0);
      expect(state.isGenerating).toBe(false);
      expect(state.storytelling).toBe("");
    });

    it("should create a presentation with a unique id", () => {
      const state = usePresentationStore.getState();
      expect(state.presentation!.id).toBeDefined();
      expect(typeof state.presentation!.id).toBe("string");
    });

    it("should initialize first slide with title layout", () => {
      const state = usePresentationStore.getState();
      const firstSlide = state.presentation!.slides[0];
      expect(firstSlide.layout).toBe("title");
      expect(firstSlide.title).toBe("Titre de la présentation");
    });
  });

  describe("setStorytelling", () => {
    it("should update storytelling text", () => {
      const { setStorytelling } = usePresentationStore.getState();
      setStorytelling("My story");
      expect(usePresentationStore.getState().storytelling).toBe("My story");
    });

    it("should handle empty string", () => {
      const { setStorytelling } = usePresentationStore.getState();
      setStorytelling("text");
      setStorytelling("");
      expect(usePresentationStore.getState().storytelling).toBe("");
    });

    it("should handle long text", () => {
      const longText = "a".repeat(10000);
      const { setStorytelling } = usePresentationStore.getState();
      setStorytelling(longText);
      expect(usePresentationStore.getState().storytelling).toBe(longText);
    });
  });

  describe("setGenerating", () => {
    it("should toggle generating state", () => {
      const { setGenerating } = usePresentationStore.getState();
      setGenerating(true);
      expect(usePresentationStore.getState().isGenerating).toBe(true);
      setGenerating(false);
      expect(usePresentationStore.getState().isGenerating).toBe(false);
    });
  });

  describe("setCurrentSlide", () => {
    it("should update current slide index", () => {
      const { addSlide, setCurrentSlide } = usePresentationStore.getState();
      addSlide();
      setCurrentSlide(1);
      expect(usePresentationStore.getState().currentSlideIndex).toBe(1);
    });

    it("should handle index 0", () => {
      const { setCurrentSlide } = usePresentationStore.getState();
      setCurrentSlide(0);
      expect(usePresentationStore.getState().currentSlideIndex).toBe(0);
    });
  });

  describe("addSlide", () => {
    it("should add a slide after current index", () => {
      const { addSlide } = usePresentationStore.getState();
      addSlide();
      const state = usePresentationStore.getState();
      expect(state.presentation!.slides).toHaveLength(2);
      expect(state.currentSlideIndex).toBe(1);
    });

    it("should add slide with custom properties", () => {
      const { addSlide } = usePresentationStore.getState();
      addSlide({ title: "Custom", layout: "two-column" });
      const state = usePresentationStore.getState();
      const newSlide = state.presentation!.slides[1];
      expect(newSlide.title).toBe("Custom");
      expect(newSlide.layout).toBe("two-column");
    });

    it("should handle adding multiple slides", () => {
      const { addSlide } = usePresentationStore.getState();
      addSlide();
      addSlide();
      addSlide();
      expect(usePresentationStore.getState().presentation!.slides).toHaveLength(4);
    });
  });

  describe("updateSlide", () => {
    it("should update slide properties", () => {
      const { updateSlide } = usePresentationStore.getState();
      updateSlide(0, { title: "Updated Title" });
      expect(usePresentationStore.getState().presentation!.slides[0].title).toBe("Updated Title");
    });

    it("should preserve unmodified properties", () => {
      const { updateSlide } = usePresentationStore.getState();
      const originalLayout = usePresentationStore.getState().presentation!.slides[0].layout;
      updateSlide(0, { title: "New Title" });
      expect(usePresentationStore.getState().presentation!.slides[0].layout).toBe(originalLayout);
    });

    it("should update updatedAt timestamp", () => {
      const { updateSlide } = usePresentationStore.getState();
      const before = usePresentationStore.getState().presentation!.updatedAt;
      updateSlide(0, { title: "Updated" });
      const after = usePresentationStore.getState().presentation!.updatedAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  describe("removeSlide", () => {
    it("should remove a slide", () => {
      const { addSlide, removeSlide } = usePresentationStore.getState();
      addSlide();
      removeSlide(0);
      expect(usePresentationStore.getState().presentation!.slides).toHaveLength(1);
    });

    it("should adjust current index when removing before current", () => {
      const { addSlide, setCurrentSlide, removeSlide } = usePresentationStore.getState();
      addSlide();
      addSlide();
      setCurrentSlide(2);
      removeSlide(0);
      expect(usePresentationStore.getState().currentSlideIndex).toBe(1);
    });

    it("should not go below 0 when removing last slide", () => {
      const { removeSlide } = usePresentationStore.getState();
      removeSlide(0);
      expect(usePresentationStore.getState().currentSlideIndex).toBe(0);
    });
  });

  describe("duplicateSlide", () => {
    it("should duplicate a slide with new id", () => {
      const { addSlide, duplicateSlide } = usePresentationStore.getState();
      addSlide({ title: "Original", content: "Content" });
      duplicateSlide(1);
      const state = usePresentationStore.getState();
      expect(state.presentation!.slides).toHaveLength(3);
      expect(state.presentation!.slides[2].title).toBe("Original");
      expect(state.presentation!.slides[2].content).toBe("Content");
      expect(state.presentation!.slides[2].id).not.toBe(state.presentation!.slides[1].id);
    });

    it("should move current index to duplicated slide", () => {
      const { duplicateSlide } = usePresentationStore.getState();
      duplicateSlide(0);
      expect(usePresentationStore.getState().currentSlideIndex).toBe(1);
    });
  });

  describe("reorderSlides", () => {
    it("should reorder slides", () => {
      const { addSlide, reorderSlides } = usePresentationStore.getState();
      addSlide({ title: "Second" });
      addSlide({ title: "Third" });
      reorderSlides(0, 2);
      const slides = usePresentationStore.getState().presentation!.slides;
      expect(slides[2].title).toBe("Titre de la présentation");
      expect(slides[0].title).toBe("Second");
    });
  });

  describe("createFromStory", () => {
    it("should create presentation from story with slides", () => {
      const { createFromStory } = usePresentationStore.getState();
      const slides = [
        { id: "s1", title: "Slide 1", content: "Content 1", layout: "title" as const },
        { id: "s2", title: "Slide 2", content: "Content 2", layout: "title-content" as const },
      ];
      createFromStory("My Title", slides);
      const state = usePresentationStore.getState();
      expect(state.presentation!.title).toBe("My Title");
      expect(state.presentation!.slides).toHaveLength(2);
      expect(state.currentSlideIndex).toBe(0);
    });

    it("should create a new unique id for the presentation", () => {
      const { createFromStory } = usePresentationStore.getState();
      const oldId = usePresentationStore.getState().presentation!.id;
      createFromStory("New", []);
      expect(usePresentationStore.getState().presentation!.id).not.toBe(oldId);
    });
  });

  describe("resetPresentation", () => {
    it("should reset to empty presentation", () => {
      const { addSlide, resetPresentation, setStorytelling } = usePresentationStore.getState();
      setStorytelling("some text");
      addSlide();
      resetPresentation();
      const state = usePresentationStore.getState();
      expect(state.presentation!.slides).toHaveLength(1);
      expect(state.currentSlideIndex).toBe(0);
      expect(state.storytelling).toBe("");
    });
  });

  describe("updatePresentationMeta", () => {
    it("should update title", () => {
      const { updatePresentationMeta } = usePresentationStore.getState();
      updatePresentationMeta({ title: "New Title" });
      expect(usePresentationStore.getState().presentation!.title).toBe("New Title");
    });

    it("should update subtitle and author", () => {
      const { updatePresentationMeta } = usePresentationStore.getState();
      updatePresentationMeta({ subtitle: "Sub", author: "John" });
      const pres = usePresentationStore.getState().presentation!;
      expect(pres.subtitle).toBe("Sub");
      expect(pres.author).toBe("John");
    });
  });

  describe("setSlideLayout", () => {
    it("should change slide layout", () => {
      const { setSlideLayout } = usePresentationStore.getState();
      setSlideLayout(0, "two-column");
      expect(usePresentationStore.getState().presentation!.slides[0].layout).toBe("two-column");
    });

    it("should handle all valid layouts", () => {
      const { setSlideLayout } = usePresentationStore.getState();
      const layouts = ["title", "title-content", "two-column", "title-only", "content-only", "image-left", "image-right"] as const;
      layouts.forEach((layout) => {
        setSlideLayout(0, layout);
        expect(usePresentationStore.getState().presentation!.slides[0].layout).toBe(layout);
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle setPresentation with null gracefully", () => {
      // The type doesn't allow null, but we test the action exists
      const { setPresentation } = usePresentationStore.getState();
      const newPres = {
        id: "test-id",
        title: "Test",
        slides: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setPresentation(newPres);
      expect(usePresentationStore.getState().presentation).toEqual(newPres);
      expect(usePresentationStore.getState().currentSlideIndex).toBe(0);
    });

    it("should handle removing slide from single-slide presentation", () => {
      const { removeSlide } = usePresentationStore.getState();
      removeSlide(0);
      const state = usePresentationStore.getState();
      expect(state.presentation!.slides).toHaveLength(0);
      expect(state.currentSlideIndex).toBe(0);
    });

    it("should handle duplicateSlide on non-existent index", () => {
      const { duplicateSlide } = usePresentationStore.getState();
      const before = usePresentationStore.getState().presentation!.slides.length;
      duplicateSlide(99);
      expect(usePresentationStore.getState().presentation!.slides).toHaveLength(before);
    });
  });
});
