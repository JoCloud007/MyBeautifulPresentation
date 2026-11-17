import { create } from "zustand";
// persist removed — manual persistence in page.tsxare";
import { Presentation, Slide, SlideLayout, SlideElement, SlideType } from "../types/presentation";
import { getActiveTemplate, useTemplateStore } from "./templateStore";
import { parseGanttContent, parseTimelineContent, parseRoadmapContent } from "../../lib/ganttParser";
import { applyDeckOperations, type DeckOperation } from "../../lib/deckEdit";

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

export type InterviewStep = "idle" | "asking" | "answering" | "generating" | "done";

export interface InterviewState {
  step: InterviewStep;
  persona: string;
  subject: string;
  questions: string[];
  answers: string[];
  storytelling: string;
}

export interface BrainstormMessage {
  role: "user" | "assistant";
  content: string;
}

export interface BrainstormState {
  persona: string;
  subject: string;
  messages: BrainstormMessage[];
  storytelling: string;
}

export interface InterviewPersona {
  id: string;
  name: string;
  description: string;
  prompt: string;
  skills: string[];
}

export const DEFAULT_INTERVIEW_PERSONAS: InterviewPersona[] = [
  {
    id: "auto",
    name: "Auto (détecté)",
    description: "L'IA choisit le meilleur profil selon votre sujet",
    prompt: "",
    skills: ["adaptation", "analyse de sujet"],
  },
  {
    id: "chief-of-staff",
    name: "Chief of Staff",
    description: "Vision stratégique, alignement exécutif, priorisation",
    prompt:
      "Tu es un Chief of Staff d'expérience. Tu penses en termes de stratégie d'entreprise, d'alignement des équipes, de priorisation des initiatives. Tu poses des questions qui aident à clarifier la vision, les objectifs mesurables, et la faisabilité opérationnelle. Tu veux un storytelling qui convaincra le comité de direction.",
    skills: ["stratégie", "alignement exécutif", "priorisation", "OKR", "feuille de route"],
  },
  {
    id: "tech-lead",
    name: "Tech Lead",
    description: "Focus technique, architecture, faisabilité tech",
    prompt:
      "Tu es un Tech Lead senior avec une vision produit. Tu poses des questions sur l'architecture, les choix technologiques, la scalabilité, la dette technique, et l'intégration avec les systèmes existants. Tu veux un storytelling qui rassure les équipes tech et démontre la solidité technique du sujet.",
    skills: ["architecture", "scalabilité", "choix technologiques", "dette technique", "intégration"],
  },
  {
    id: "expert",
    name: "Expert Domaine",
    description: "Expertise sectorielle, tendances, benchmarks",
    prompt:
      "Tu es un expert reconnu dans le domaine du sujet. Tu poses des questions sur les tendances du marché, les benchmarks concurrentiels, les données chiffrées, et les meilleures pratiques. Tu veux un storytelling crédible, factuel, et qui démontre une expertise pointue.",
    skills: ["tendances marché", "benchmarks", "données chiffrées", "meilleures pratiques", "veille sectorielle"],
  },
  {
    id: "cfo",
    name: "CFO",
    description: "Focus financier, ROI, viabilité économique",
    prompt:
      "Tu es un Directeur Financier (CFO). Chaque décision a un coût et un retour. Tu poses des questions sur le ROI, les budgets, les revenus projetés, les coûts cachés, et la viabilité économique. Tu veux un storytelling solide financièrement qui justifie chaque investissement.",
    skills: ["ROI", "budget", "viabilité économique", "revenus projetés", "coûts cachés"],
  },
];

interface PresentationState {
  presentation: Presentation | null;
  currentSlideIndex: number;
  isGenerating: boolean;
  storytelling: string;
  interview: InterviewState;
  interviewPersonas: InterviewPersona[];
  brainstorm: BrainstormState;
  ghostSlides: Array<{ title: string; content: string; layout: SlideLayout }>;
  isGhostVisible: boolean;
  slideEditType: SlideType;

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
  /** Applies an incremental edit plan and returns the operations really applied. */
  applyDeckEdit: (operations: DeckOperation[]) => DeckOperation[];
  updatePresentationMeta: (meta: Partial<Pick<Presentation, "title" | "subtitle" | "author">>) => void;
  setSlideLayout: (index: number, layout: SlideLayout) => void;
  updateSlideData: (index: number, data: Slide["data"]) => void;
  setSlideEditType: (type: SlideType) => void;
  setSlideElements: (index: number, elements: SlideElement[]) => void;
  addSlideElement: (index: number, element: SlideElement) => void;
  removeSlideElement: (index: number, elementId: string) => void;
  updateSlideElement: (index: number, elementId: string, updates: Partial<SlideElement>) => void;
  // Interview actions
  setInterviewPersona: (persona: string) => void;
  setInterviewSubject: (subject: string) => void;
  setInterviewQuestions: (questions: string[]) => void;
  setInterviewAnswer: (index: number, answer: string) => void;
  setInterviewStorytelling: (storytelling: string) => void;
  setInterviewStep: (step: InterviewStep) => void;
  resetInterview: () => void;
  setInterviewPersonas: (personas: InterviewPersona[]) => void;
  addInterviewPersona: (persona: InterviewPersona) => void;
  updateInterviewPersona: (id: string, updates: Partial<InterviewPersona>) => void;
  removeInterviewPersona: (id: string) => void;
  // Brainstorm actions
  setBrainstormPersona: (persona: string) => void;
  setBrainstormSubject: (subject: string) => void;
  addBrainstormMessage: (message: BrainstormMessage) => void;
  setBrainstormStorytelling: (storytelling: string) => void;
  resetBrainstorm: () => void;
  setGhostSlides: (slides: Array<{ title: string; content: string; layout: SlideLayout }>) => void;
  clearGhostSlides: () => void;
  setGhostVisible: (visible: boolean) => void;
}

export function legacySlideToElements(slide: Slide): SlideElement[] {
  const elements: SlideElement[] = [];
  const titleId = generateUUID();

  // Titre - toujours présent en haut
  elements.push({
    id: titleId,
    type: "text",
    x: 10,
    y: 8,
    w: 80,
    h: 12,
    content: slide.title,
    style: {
      fontSize: 36,
      // No fontFamily: the renderer falls back to the active template's
      // `fonts.body`, so a migrated slide follows the chosen theme.
      textAlign: "center",
      fontWeight: 700,
    },
  });

  if (slide.layout === "title" && slide.content) {
    elements.push({
      id: generateUUID(),
      type: "text",
      x: 15,
      y: 35,
      w: 70,
      h: 20,
      content: slide.content,
      style: {
        fontSize: 22,
        textAlign: "center",
      },
    });
  } else if (slide.layout === "two-column" && slide.content) {
    const parts = slide.content.split("|").map((p) => p.trim());
    const left = parts[0] || slide.content;
    const right = parts[1] || "";
    elements.push({
      id: generateUUID(),
      type: "text",
      x: 8,
      y: 28,
      w: 40,
      h: 55,
      content: left,
      style: {
        fontSize: 20,
        borderRadius: 8,
        padding: 12,
      },
    });
    elements.push({
      id: generateUUID(),
      type: "text",
      x: 52,
      y: 28,
      w: 40,
      h: 55,
      content: right,
      style: {
        fontSize: 20,
        borderRadius: 8,
        padding: 12,
      },
    });
  } else if (slide.layout === "title-only") {
    // Juste le titre, centré verticalement
    const titleEl = elements[0];
    titleEl.y = 40;
    titleEl.h = 20;
  } else if (slide.content) {
    // Default: title-content, content-only, etc.
    elements.push({
      id: generateUUID(),
      type: "text",
      x: 10,
      y: 26,
      w: 80,
      h: 60,
      content: slide.content,
      style: {
        fontSize: 20,
        textAlign: "left",
      },
    });
  }

  return elements;
}

/**
 * Historical migrations and canvas helpers hard-coded a light palette into
 * element styles (e.g. "#1e293b" text, "#f8fafc" cards). Those values override
 * the active theme and make text unreadable on dark templates. Strip exactly
 * those legacy values so elements fall back to the theme colors; anything the
 * user explicitly picked is preserved (unless it matches the legacy palette).
 */
const LEGACY_TEXT_COLORS = new Set(["#1e293b", "#64748b", "#334155"]);
const LEGACY_TEXT_BACKGROUNDS = new Set(["#f8fafc"]);
const LEGACY_SHAPE_BACKGROUNDS = new Set(["#e2e8f0"]);
const LEGACY_BORDER_COLORS = new Set(["#94a3b8", "#cbd5e1"]);

/**
 * Body/title sizes were calibrated far too small for a 16:9 slide: 14px on the
 * 800×450 canvas is 3.1% of the slide height (≈14pt once exported), so slide
 * text looked microscopic. Raise the legacy values to readable proportions
 * (body ≈4.4%, title ≈8%); anything the user chose explicitly is kept.
 */
const LEGACY_FONT_SIZES: Record<number, number> = { 14: 20, 18: 22, 28: 36 };

export function normalizeLegacyElementStyles(presentation: Presentation): Presentation {
  if (!presentation?.slides) return presentation;
  // The migration runs ONCE per presentation. Without this guard the font-size
  // upgrade below would silently rewrite a size the user explicitly picked in
  // the properties panel (14/18/28 are both legacy defaults and valid choices).
  if (presentation.legacyStylesNormalized) return presentation;
  // A deck with no element at all has nothing to migrate: leave it untouched
  // (and unmarked) so an empty presentation stays byte-identical.
  const hasElements = presentation.slides.some((slide) => slide.elements?.length);
  return {
    ...presentation,
    ...(hasElements ? { legacyStylesNormalized: true } : {}),
    slides: presentation.slides.map((slide) => {
      if (!slide.elements?.length) return slide;
      return {
        ...slide,
        elements: slide.elements.map((el) => {
          if (!el.style) return el;
          const style = { ...el.style };
          if (el.type === "text") {
            if (style.color && LEGACY_TEXT_COLORS.has(style.color.toLowerCase())) {
              delete style.color;
            }
            if (style.backgroundColor && LEGACY_TEXT_BACKGROUNDS.has(style.backgroundColor.toLowerCase())) {
              delete style.backgroundColor;
            }
            const upgraded = style.fontSize != null ? LEGACY_FONT_SIZES[style.fontSize] : undefined;
            if (upgraded != null) style.fontSize = upgraded;
          } else {
            if (style.backgroundColor && LEGACY_SHAPE_BACKGROUNDS.has(style.backgroundColor.toLowerCase())) {
              delete style.backgroundColor;
            }
          }
          if (style.borderColor && LEGACY_BORDER_COLORS.has(style.borderColor.toLowerCase())) {
            delete style.borderColor;
          }
          return { ...el, style };
        }),
      };
    }),
  };
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
};

function enrichSlideData(slide: Slide): Slide {
  if (slide.layout === "gantt" && slide.content.trim()) {
    try {
      const tasks = parseGanttContent(slide.content);
      if (tasks.length > 0) {
        return { ...slide, data: { gantt: { tasks } } };
      }
    } catch {
      // ignore parsing errors, keep raw content
    }
  }
  if (slide.layout === "timeline" && slide.content.trim()) {
    try {
      const events = parseTimelineContent(slide.content);
      if (events.length > 0) {
        return { ...slide, data: { timeline: { events } } };
      }
    } catch {
      // ignore parsing errors, keep raw content
    }
  }
  if (slide.layout === "roadmap" && slide.content.trim()) {
    try {
      const { items, lanes } = parseRoadmapContent(slide.content);
      if (items.length > 0) {
        return { ...slide, data: { ...(slide.data || {}), roadmap: { items, lanes } } as any };
      }
    } catch {
      // ignore parsing errors, keep raw content
    }
  }
  return slide;
}

const createDefaultSlide = (overrides: Partial<Slide> = {}): Slide => ({
  id: generateUUID(),
  title: "Nouvelle slide",
  content: "",
  layout: "title-content",
  ...overrides,
});

export const usePresentationStore = create<PresentationState>()(
  (set) => ({
      presentation: createEmptyPresentation(),
      currentSlideIndex: 0,
      isGenerating: false,
      storytelling: "",
      interview: {
        step: "idle",
        persona: "auto",
        subject: "",
        questions: [],
        answers: [],
        storytelling: "",
      },
      interviewPersonas: [], // custom personas only; defaults are merged at read time
      brainstorm: {
        persona: "auto",
        subject: "",
        messages: [],
        storytelling: "",
      },
      ghostSlides: [],
      isGhostVisible: false,
      slideEditType: "content" as SlideType,

      setPresentation: (presentation) =>
        set({ presentation: normalizeLegacyElementStyles(presentation), currentSlideIndex: 0 }),

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
            slides: slides.map(enrichSlideData),
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          currentSlideIndex: 0,
        })),

      /**
       * Applies an incremental edit plan (add / update / delete / move) to the
       * current deck. The presentation id, title and untouched slides are kept
       * as-is: this is the opposite of `createFromStory`, which replaces
       * everything.
       */
      applyDeckEdit: (operations) => {
        let appliedOperations: DeckOperation[] = [];
        set((state) => {
          if (!state.presentation || operations.length === 0) return state;

          const outcome = applyDeckOperations(state.presentation.slides, operations);
          if (outcome.applied.length === 0) return state;
          appliedOperations = outcome.applied;

          const added = new Set(outcome.addedIds);
          const slides = outcome.slides.map((slide) =>
            added.has(slide.id) || !slide.data ? enrichSlideData(slide) : slide
          );

          const currentSlideIndex =
            outcome.touchedIndex === null
              ? state.currentSlideIndex
              : Math.min(outcome.touchedIndex, Math.max(0, slides.length - 1));

          return {
            presentation: {
              ...state.presentation,
              slides,
              updatedAt: Date.now(),
            },
            currentSlideIndex,
          };
        });
        return appliedOperations;
      },

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

      // Interview actions
      setInterviewPersona: (persona) =>
        set((state) => ({
          interview: { ...state.interview, persona },
        })),

      setInterviewSubject: (subject) =>
        set((state) => ({
          interview: { ...state.interview, subject, step: "idle" },
        })),

      setInterviewQuestions: (questions) =>
        set((state) => ({
          interview: { ...state.interview, questions, answers: new Array(questions.length).fill(""), step: "answering" },
        })),

      setInterviewAnswer: (index, answer) =>
        set((state) => {
          const newAnswers = [...state.interview.answers];
          newAnswers[index] = answer;
          return { interview: { ...state.interview, answers: newAnswers } };
        }),

      setInterviewStorytelling: (storytelling) =>
        set((state) => ({
          interview: { ...state.interview, storytelling, step: "done" },
          storytelling,
        })),

      setInterviewStep: (step) =>
        set((state) => ({
          interview: { ...state.interview, step },
        })),

      resetInterview: () =>
        set({
          interview: { step: "idle", persona: "auto", subject: "", questions: [], answers: [], storytelling: "" },
        }),

      setInterviewPersonas: (interviewPersonas) => set({ interviewPersonas }),

      addInterviewPersona: (persona) =>
        set((state) => ({
          interviewPersonas: [...state.interviewPersonas, persona],
        })),

      updateInterviewPersona: (id, updates) =>
        set((state) => ({
          interviewPersonas: state.interviewPersonas.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),

      removeInterviewPersona: (id) =>
        set((state) => ({
          interviewPersonas: state.interviewPersonas.filter((p) => p.id !== id),
        })),

      // Brainstorm actions
      setBrainstormPersona: (persona) =>
        set((state) => ({
          brainstorm: { ...state.brainstorm, persona },
        })),

      setBrainstormSubject: (subject) =>
        set((state) => ({
          brainstorm: { ...state.brainstorm, subject },
        })),

      addBrainstormMessage: (message) =>
        set((state) => ({
          brainstorm: {
            ...state.brainstorm,
            messages: [...state.brainstorm.messages, message],
          },
        })),

      setBrainstormStorytelling: (storytelling) =>
        set((state) => ({
          brainstorm: { ...state.brainstorm, storytelling },
          storytelling,
        })),

      resetBrainstorm: () =>
        set({
          brainstorm: { persona: "auto", subject: "", messages: [], storytelling: "" },
        }),

      setSlideEditType: (slideEditType) => set({ slideEditType }),

      setSlideElements: (index, elements) =>
        set((state) => ({
          presentation: state.presentation
            ? {
                ...state.presentation,
                slides: state.presentation.slides.map((s, i) =>
                  i === index ? { ...s, elements } : s
                ),
                updatedAt: Date.now(),
              }
            : null,
        })),

      addSlideElement: (index, element) =>
        set((state) => {
          if (!state.presentation) return state;
          const slide = state.presentation.slides[index];
          if (!slide) return state;
          const elements = [...(slide.elements || []), element];
          return {
            presentation: {
              ...state.presentation,
              slides: state.presentation.slides.map((s, i) =>
                i === index ? { ...s, elements } : s
              ),
              updatedAt: Date.now(),
            },
          };
        }),

      removeSlideElement: (index, elementId) =>
        set((state) => {
          if (!state.presentation) return state;
          const slide = state.presentation.slides[index];
          if (!slide) return state;
          const elements = (slide.elements || []).filter((e) => e.id !== elementId);
          return {
            presentation: {
              ...state.presentation,
              slides: state.presentation.slides.map((s, i) =>
                i === index ? { ...s, elements } : s
              ),
              updatedAt: Date.now(),
            },
          };
        }),

      updateSlideElement: (index, elementId, updates) =>
        set((state) => {
          if (!state.presentation) return state;
          const slide = state.presentation.slides[index];
          if (!slide) return state;
          const elements = (slide.elements || []).map((e) =>
            e.id === elementId ? { ...e, ...updates } : e
          );
          return {
            presentation: {
              ...state.presentation,
              slides: state.presentation.slides.map((s, i) =>
                i === index ? { ...s, elements } : s
              ),
              updatedAt: Date.now(),
            },
          };
        }),

      setGhostSlides: (ghostSlides) => set({ ghostSlides }),
      clearGhostSlides: () => set({ ghostSlides: [], isGhostVisible: false }),
      setGhostVisible: (isGhostVisible) => set({ isGhostVisible }),
    })
  );
