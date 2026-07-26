import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LlmConfig } from "../types/llm";

interface LlmState {
  config: LlmConfig;
  isAvailable: boolean | null;
  availableModels: string[];
  isCheckingConnection: boolean;
  lastError: string | null;

  // Actions
  setConfig: (config: Partial<LlmConfig>) => void;
  setAvailable: (available: boolean) => void;
  setModels: (models: string[]) => void;
  setCheckingConnection: (checking: boolean) => void;
  setLastError: (error: string | null) => void;
  resetConfig: () => void;
}

const defaultConfig: LlmConfig = {
  baseUrl: "http://ollama:11434",
  model: "llama3.2",
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt:
    "Tu es un expert en création de présentations PowerPoint. Tu transformes un storytelling en langage naturel en slides structurées. Tu réponds UNIQUEMENT au format JSON avec un tableau de slides. Chaque slide a: title (string), content (string), layout (string parmi: title, title-content, two-column, title-only, content-only). Sois concis et impactant.",
};

export const useLlmStore = create<LlmState>()(
  persist(
    (set) => ({
      config: { ...defaultConfig },
      isAvailable: null,
      availableModels: [],
      isCheckingConnection: false,
      lastError: null,

      setConfig: (config) =>
        set((state) => ({
          config: { ...state.config, ...config },
        })),

      setAvailable: (available) => set({ isAvailable: available }),

      setModels: (models) => set({ availableModels: models }),

      setCheckingConnection: (checking) => set({ isCheckingConnection: checking }),

      setLastError: (error) => set({ lastError: error }),

      resetConfig: () => set({ config: { ...defaultConfig } }),
    }),
    {
      name: "mybp-llm-config",
      partialize: (state) => ({ config: state.config }),
    }
  )
);
