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
  updateTemplate: (id: string, updates: Partial<Template>) => void;
  cloneTemplate: (baseId: string, newName: string) => string;
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Les templates intégrés vivent dans un module de données pures
// (`lib/templates/builtin.ts`) afin d'être importables hors navigateur
// (route API, CLI de déploiement). Ré-exporté ici pour les imports existants.
export { builtInTemplates } from "@/lib/templates/builtin";
import { builtInTemplates } from "@/lib/templates/builtin";


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

      updateTemplate: (id, updates) =>
        set((state) => ({
          customTemplates: state.customTemplates.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        })),

      cloneTemplate: (baseId, newName) => {
        let newId = "";
        set((state) => {
          const base =
            builtInTemplates[baseId as TemplateId] ||
            state.customTemplates.find((t) => t.id === baseId);
          if (!base) return state;
          newId = generateUUID();
          const cloned: Template = {
            ...base,
            id: newId,
            name: newName,
            description: `Copie de ${base.name}`,
          };
          return {
            customTemplates: [...state.customTemplates, cloned],
            activeTemplateId: newId,
          };
        });
        return newId;
      },
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
