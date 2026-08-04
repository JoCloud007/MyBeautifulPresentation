import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Presentation, Slide, SlideLayout } from "../types/presentation";
import { getActiveTemplate, useTemplateStore } from "./templateStore";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface PresentationState {
  presentation: Presentation | null;
  currentSlideIndex: number;
  isGenerating: boolean;
  storytelling: string;

  // Actions
  setPresentation: (presentation: Presentation) => void;
  setCurrentSlide: (index: number) => void;
  setStorytelling: (text: string) => void;
  setGenerating: (generating: boolean) => void;
  addSlide: (slide?: Partial<Slide>) => void;
  updateSlide: (index: number, slide: Partial<Slide>) => void;
  removeSlide: (index: number) => void;
  duplicateSlide: (index: number) => void;
  reorderSlides: (fromIndex: number, toIndex: number) => void;
  resetPresentation: () => void;
  createFromStory: (title: string, slides: Slide[]) => void;
  updatePresentationMeta: (meta: Partial<Pick<Presentation, "title" | "subtitle" | "author">>) => void;
  setSlideLayout: (index: number, layout: SlideLayout) => void;
  updateSlideData: (index: number, data: Slide["data"]) => void;
}

const createEmptyPresentation = (): Presentation => {
  return {
    id: generateUUID(),
    title: "Nouvelle Présentation",
    subtitle: "",
    author: "",
    slides: [
      {
        id: generateUUID(),
        title: "Titre de la présentation",
        content: "Sous-titre ou description",
        layout: "title" as SlideLayout,
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return {
    id: generateUUID(),
    title: "Nouvelle Présentation",
    subtitle: "",
    author: "",
    slides: [
      {
        id: generateUUID(),
        title: "Titre de la présentation",
        content: "Sous-titre ou description",
        layout: "title",
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
};

const createDefaultSlide = (overrides: Partial<Slide> = {}): Slide => ({
  id: generateUUID(),
  title: "Nouvelle slide",
  content: "",
  layout: "title-content",
  ...overrides,
});

export const usePresentationStore = create<PresentationState>()(
  persist(
    (set) => ({
      presentation: createEmptyPresentation(),
      currentSlideIndex: 0,
      isGenerating: false,
      storytelling: "",

      setPresentation: (presentation) =>
        set({ presentation, currentSlideIndex: 0 }),

      setCurrentSlide: (index) => set({ currentSlideIndex: index }),

      setStorytelling: (text) => set({ storytelling: text }),

      setGenerating: (generating) => set({ isGenerating: generating }),

      addSlide: (slide) =>
        set((state) => {
          const newSlide = createDefaultSlide(slide);
          const currentSlides = state.presentation?.slides || [];
          const insertIndex = state.currentSlideIndex + 1;
          const newSlides = [
            ...currentSlides.slice(0, insertIndex),
            newSlide,
            ...currentSlides.slice(insertIndex),
          ];
          if (state.presentation) {
            return {
              presentation: {
                ...state.presentation,
                slides: newSlides,
                updatedAt: Date.now(),
              },
              currentSlideIndex: insertIndex,
            };
          }
          // Fallback: create new presentation WITH the intended slide
          return {
            presentation: {
              id: generateUUID(),
              title: "Nouvelle Présentation",
              subtitle: "",
              author: "",
              slides: [newSlide],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            currentSlideIndex: 0,
          };
        }),

      updateSlide: (index, slide) =>
        set((state) => ({
          presentation: state.presentation
            ? {
                ...state.presentation,
                slides: state.presentation.slides.map((s, i) =>
                  i === index ? { ...s, ...slide } : s
                ),
                updatedAt: Date.now(),
              }
            : createEmptyPresentation(),
        })),

      removeSlide: (index) =>
        set((state) => {
          if (!state.presentation) return state;
          const newSlides = state.presentation.slides.filter((_, i) => i !== index);
          // Decrement currentSlideIndex when removing a slide before the current one
          let newCurrentIndex = state.currentSlideIndex;
          if (index < state.currentSlideIndex) {
            newCurrentIndex = Math.max(0, state.currentSlideIndex - 1);
          } else if (index === state.currentSlideIndex) {
            newCurrentIndex = Math.min(state.currentSlideIndex, Math.max(0, newSlides.length - 1));
          }
          return {
            presentation: {
              ...state.presentation,
              slides: newSlides,
              updatedAt: Date.now(),
            },
            currentSlideIndex: newCurrentIndex,
          };
        }),

      duplicateSlide: (index) =>
        set((state) => {
          if (!state.presentation) return state;
          const slideToCopy = state.presentation.slides[index];
          if (!slideToCopy) return state;
          const duplicated: Slide = {
            ...slideToCopy,
            id: generateUUID(),
          };
          const newSlides = [
            ...state.presentation.slides.slice(0, index + 1),
            duplicated,
            ...state.presentation.slides.slice(index + 1),
          ];
          return {
            presentation: {
              ...state.presentation,
              slides: newSlides,
              updatedAt: Date.now(),
            },
            currentSlideIndex: index + 1,
          };
        }),

      reorderSlides: (fromIndex, toIndex) =>
        set((state) => {
          if (!state.presentation) return state;
          const slides = [...state.presentation.slides];
          const [moved] = slides.splice(fromIndex, 1);
          slides.splice(toIndex, 0, moved);
          return {
            presentation: {
              ...state.presentation,
              slides,
              updatedAt: Date.now(),
            },
          };
        }),

      resetPresentation: () =>
        set({
          presentation: createEmptyPresentation(),
          currentSlideIndex: 0,
          storytelling: "",
        }),

      createFromStory: (title, slides) =>
        set((state) => ({
          presentation: {
            id: generateUUID(),
            title,
            subtitle: state.presentation?.subtitle ?? "",
            author: state.presentation?.author ?? "",
            slides,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          currentSlideIndex: 0,
        })),

      updatePresentationMeta: (meta) =>
        set((state) => ({
          presentation: state.presentation
            ? {
                ...state.presentation,
                ...meta,
                updatedAt: Date.now(),
              }
            : null,
        })),

      setSlideLayout: (index, layout) =>
        set((state) => ({
          presentation: state.presentation
            ? {
                ...state.presentation,
                slides: state.presentation.slides.map((s, i) =>
                  i === index ? { ...s, layout } : s
                ),
                updatedAt: Date.now(),
              }
            : null,
        })),

      updateSlideData: (index, data) =>
        set((state) => ({
          presentation: state.presentation
            ? {
                ...state.presentation,
                slides: state.presentation.slides.map((s, i) =>
                  i === index ? { ...s, data } : s
                ),
                updatedAt: Date.now(),
              }
            : null,
        })),
    }),
    {
      name: "mybp-presentation",
      partialize: (state) => ({
        presentation: state.presentation,
        storytelling: state.storytelling,
      }),
    }
  )
);
