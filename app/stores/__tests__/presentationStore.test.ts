import { describe, it, expect, beforeEach } from "vitest";
import { usePresentationStore } from "../presentationStore";
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
});
