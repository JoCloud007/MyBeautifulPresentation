import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Template, TemplateId } from "../types/template";

interface TemplateState {
  activeTemplateId: string;
  customTemplates: Template[];

  // Actions
  setActiveTemplate: (id: string) => void;
  addCustomTemplate: (template: Template) => void;
  removeCustomTemplate: (id: string) => void;
}

export const builtInTemplates: Record<TemplateId, Template> = {
  corporate: {
    id: "corporate",
    name: "Corporate",
    description: "Design professionnel et élégant pour le monde des affaires",
    category: "corporate",
    colors: {
      name: "corporate",
      background: "#ffffff",
      foreground: "#1a1a2e",
      accent: "#1e40af",
      secondary: "#64748b",
      muted: "#f1f5f9",
      border: "#e2e8f0",
    },
    fonts: {
      heading: "Geist, system-ui, sans-serif",
      body: "Geist, system-ui, sans-serif",
    },
    defaultSlides: [
      { layout: "title" },
      { layout: "title-content" },
      { layout: "two-column" },
    ],
  },
  tech: {
    id: "tech",
    name: "Tech",
    description: "Design moderne et dynamique pour la tech et l'innovation",
    category: "tech",
    colors: {
      name: "tech",
      background: "#0f172a",
      foreground: "#f8fafc",
      accent: "#06b6d4",
      secondary: "#94a3b8",
      muted: "#1e293b",
      border: "#334155",
    },
    fonts: {
      heading: "Geist, system-ui, sans-serif",
      body: "Geist, system-ui, sans-serif",
    },
    defaultSlides: [
      { layout: "title" },
      { layout: "title-content" },
      { layout: "content-only" },
    ],
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    description: "Design épuré et minimaliste pour un impact maximal",
    category: "minimal",
    colors: {
      name: "minimal",
      background: "#fafafa",
      foreground: "#171717",
      accent: "#171717",
      secondary: "#737373",
      muted: "#f5f5f5",
      border: "#e5e5e5",
    },
    fonts: {
      heading: "Geist, system-ui, sans-serif",
      body: "Geist, system-ui, sans-serif",
    },
    defaultSlides: [
      { layout: "title" },
      { layout: "title-only" },
      { layout: "content-only" },
    ],
  },
};

export const useTemplateStore = create<TemplateState>()(
  persist(
    (set) => ({
      activeTemplateId: "corporate",
      customTemplates: [],

      setActiveTemplate: (id) => set({ activeTemplateId: id }),

      addCustomTemplate: (template) =>
        set((state) => ({
          customTemplates: [...state.customTemplates, template],
        })),

      removeCustomTemplate: (id) =>
        set((state) => ({
          customTemplates: state.customTemplates.filter((t) => t.id !== id),
        })),
    }),
    {
      name: "mybp-templates",
      partialize: (state) => ({
        activeTemplateId: state.activeTemplateId,
        customTemplates: state.customTemplates,
      }),
    }
  )
);

export const getActiveTemplate = (state: TemplateState): Template => {
  return (
    builtInTemplates[state.activeTemplateId as TemplateId] ||
    state.customTemplates.find((t) => t.id === state.activeTemplateId) ||
    builtInTemplates.corporate
  );
};
