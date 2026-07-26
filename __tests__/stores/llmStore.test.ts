import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useLlmStore } from "@/app/stores/llmStore";

describe("LlmStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Reset store to initial state before each test
    useLlmStore.setState(useLlmStore.getInitialState?.() || {
      config: {
        baseUrl: "http://localhost:11434",
        model: "llama3.2",
        temperature: 0.7,
        maxTokens: 4096,
        systemPrompt: "Tu es un expert en création de présentations PowerPoint. Tu transforms un storytelling en langage naturel en slides structurées. Tu réponds UNIQUEMENT au format JSON avec un tableau de slides. Chaque slide a: title (string), content (string), layout (string parmi: title, title-content, two-column, title-only, content-only). Sois concis et impactant.",
      },
      isAvailable: null,
      availableModels: [],
      isCheckingConnection: false,
      lastError: null,
    });
  });

  afterEach(() => {
    // Clean up any persisted state
    window.localStorage.clear();
  });

  describe("initial state", () => {
    it("has default config with localhost Ollama URL", () => {
      const state = useLlmStore.getState();
      expect(state.config.baseUrl).toBe("http://localhost:11434");
    });

    it("has default model set to llama3.2", () => {
      const state = useLlmStore.getState();
      expect(state.config.model).toBe("llama3.2");
    });

    it("has default temperature of 0.7", () => {
      const state = useLlmStore.getState();
      expect(state.config.temperature).toBe(0.7);
    });

    it("has default maxTokens of 4096", () => {
      const state = useLlmStore.getState();
      expect(state.config.maxTokens).toBe(4096);
    });

    it("has isAvailable set to null initially", () => {
      const state = useLlmStore.getState();
      expect(state.isAvailable).toBeNull();
    });

    it("has empty availableModels initially", () => {
      const state = useLlmStore.getState();
      expect(state.availableModels).toEqual([]);
    });

    it("has isCheckingConnection set to false initially", () => {
      const state = useLlmStore.getState();
      expect(state.isCheckingConnection).toBe(false);
    });

    it("has lastError set to null initially", () => {
      const state = useLlmStore.getState();
      expect(state.lastError).toBeNull();
    });

    it("has a non-empty systemPrompt", () => {
      const state = useLlmStore.getState();
      expect(state.config.systemPrompt.length).toBeGreaterThan(0);
      expect(state.config.systemPrompt).toContain("JSON");
    });
  });

  describe("setConfig", () => {
    it("updates a single config field", () => {
      useLlmStore.getState().setConfig({ model: "mistral" });
      expect(useLlmStore.getState().config.model).toBe("mistral");
    });

    it("updates multiple config fields at once", () => {
      useLlmStore.getState().setConfig({ model: "mistral", temperature: 0.9 });
      const config = useLlmStore.getState().config;
      expect(config.model).toBe("mistral");
      expect(config.temperature).toBe(0.9);
    });

    it("preserves unchanged config fields", () => {
      const originalUrl = useLlmStore.getState().config.baseUrl;
      useLlmStore.getState().setConfig({ model: "mistral" });
      expect(useLlmStore.getState().config.baseUrl).toBe(originalUrl);
    });

    it("updates baseUrl", () => {
      useLlmStore.getState().setConfig({ baseUrl: "http://192.168.1.10:11434" });
      expect(useLlmStore.getState().config.baseUrl).toBe("http://192.168.1.10:11434");
    });

    it("updates temperature to 0 (deterministic)", () => {
      useLlmStore.getState().setConfig({ temperature: 0 });
      expect(useLlmStore.getState().config.temperature).toBe(0);
    });

    it("updates temperature to 1 (creative)", () => {
      useLlmStore.getState().setConfig({ temperature: 1 });
      expect(useLlmStore.getState().config.temperature).toBe(1);
    });

    it("updates maxTokens", () => {
      useLlmStore.getState().setConfig({ maxTokens: 2048 });
      expect(useLlmStore.getState().config.maxTokens).toBe(2048);
    });

    it("updates systemPrompt", () => {
      const newPrompt = "Custom prompt";
      useLlmStore.getState().setConfig({ systemPrompt: newPrompt });
      expect(useLlmStore.getState().config.systemPrompt).toBe(newPrompt);
    });
  });

  describe("setAvailable", () => {
    it("sets isAvailable to true", () => {
      useLlmStore.getState().setAvailable(true);
      expect(useLlmStore.getState().isAvailable).toBe(true);
    });

    it("sets isAvailable to false", () => {
      useLlmStore.getState().setAvailable(false);
      expect(useLlmStore.getState().isAvailable).toBe(false);
    });
  });

  describe("setModels", () => {
    it("sets availableModels array", () => {
      const models = ["llama3.2", "mistral", "codellama"];
      useLlmStore.getState().setModels(models);
      expect(useLlmStore.getState().availableModels).toEqual(models);
    });

    it("sets empty array", () => {
      useLlmStore.getState().setModels([]);
      expect(useLlmStore.getState().availableModels).toEqual([]);
    });

    it("overwrites previous models", () => {
      useLlmStore.getState().setModels(["old-model"]);
      useLlmStore.getState().setModels(["new-model"]);
      expect(useLlmStore.getState().availableModels).toEqual(["new-model"]);
    });
  });

  describe("setCheckingConnection", () => {
    it("sets isCheckingConnection to true", () => {
      useLlmStore.getState().setCheckingConnection(true);
      expect(useLlmStore.getState().isCheckingConnection).toBe(true);
    });

    it("sets isCheckingConnection to false", () => {
      useLlmStore.getState().setCheckingConnection(true);
      useLlmStore.getState().setCheckingConnection(false);
      expect(useLlmStore.getState().isCheckingConnection).toBe(false);
    });
  });

  describe("setLastError", () => {
    it("sets lastError to a string", () => {
      useLlmStore.getState().setLastError("Connection failed");
      expect(useLlmStore.getState().lastError).toBe("Connection failed");
    });

    it("clears lastError with null", () => {
      useLlmStore.getState().setLastError("Error");
      useLlmStore.getState().setLastError(null);
      expect(useLlmStore.getState().lastError).toBeNull();
    });
  });

  describe("resetConfig", () => {
    it("resets all config fields to defaults", () => {
      const store = useLlmStore.getState();
      store.setConfig({
        baseUrl: "http://custom:11434",
        model: "custom-model",
        temperature: 0.1,
        maxTokens: 512,
        systemPrompt: "custom",
      });
      store.resetConfig();

      const config = useLlmStore.getState().config;
      expect(config.baseUrl).toBe("http://localhost:11434");
      expect(config.model).toBe("llama3.2");
      expect(config.temperature).toBe(0.7);
      expect(config.maxTokens).toBe(4096);
      expect(config.systemPrompt).toContain("JSON");
    });

    it("does not reset non-config state", () => {
      useLlmStore.getState().setAvailable(true);
      useLlmStore.getState().setModels(["mistral"]);
      useLlmStore.getState().setLastError("some error");
      useLlmStore.getState().resetConfig();

      const state = useLlmStore.getState();
      expect(state.isAvailable).toBe(true);
      expect(state.availableModels).toEqual(["mistral"]);
      expect(state.lastError).toBe("some error");
    });
  });

  describe("persistence", () => {
    it("persists config to localStorage", async () => {
      useLlmStore.getState().setConfig({ model: "persisted-model" });
      // Zustand persist writes asynchronously; wait for it
      await new Promise((r) => setTimeout(r, 50));
      const persisted = window.localStorage.getItem("mybp-llm-config");
      expect(persisted).toBeTruthy();
      const parsed = JSON.parse(persisted!);
      expect(parsed.state.config.model).toBe("persisted-model");
    });

    it("only persists config, not transient state", async () => {
      useLlmStore.getState().setConfig({ model: "test-model" });
      useLlmStore.getState().setAvailable(true);
      useLlmStore.getState().setLastError("error");
      await new Promise((r) => setTimeout(r, 50));

      const persisted = window.localStorage.getItem("mybp-llm-config");
      const parsed = JSON.parse(persisted!);
      expect(parsed.state).toHaveProperty("config");
      expect(parsed.state).not.toHaveProperty("isAvailable");
      expect(parsed.state).not.toHaveProperty("lastError");
    });
  });
});
