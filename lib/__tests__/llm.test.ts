import { describe, it, expect } from "vitest";
import {
  buildStorytellingPrompt,
  parseLlmSlidesResponse,
  normalizeLayout,
  buildStoryChatPrompt,
  parseStoryChatResponse,
} from "../llm";
import { LlmConfig } from "@/app/types/llm";
import { Template } from "@/app/types/template";

const dummyConfig: LlmConfig = {
  provider: "ollama",
  baseUrl: "http://localhost:11434",
  model: "llama3.2",
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: "",
};

describe("lib/llm", () => {
  describe("buildStorytellingPrompt", () => {
    it("returns system and user messages", () => {
      const messages = buildStorytellingPrompt("My story", dummyConfig);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("user");
    });

    it("includes storytelling in user message", () => {
      const messages = buildStorytellingPrompt("Launching a new product", dummyConfig);
      expect(messages[1].content).toContain("Launching a new product");
    });

    it("includes JSON rules in system message", () => {
      const messages = buildStorytellingPrompt("Test", dummyConfig);
      expect(messages[0].content).toContain("JSON");
      expect(messages[0].content).toContain("slides");
    });

    it("includes template context when template provided", () => {
      const template: Template = {
        id: "tech",
        name: "Tech",
        description: "Modern tech design",
        category: "tech",
        colors: {
          name: "tech",
          background: "#000",
          foreground: "#fff",
          accent: "#0ff",
          secondary: "#888",
          muted: "#111",
          border: "#333",
        },
        fonts: { heading: "Arial", body: "Arial" },
        defaultSlides: [],
      };
      const messages = buildStorytellingPrompt("Test", dummyConfig, template);
      expect(messages[0].content).toContain('template "Tech"');
      expect(messages[0].content).toContain("Modern tech design");
    });

    it("does not include template context when no template", () => {
      const messages = buildStorytellingPrompt("Test", dummyConfig);
      expect(messages[0].content).not.toContain('template "');
    });
  });

  describe("parseLlmSlidesResponse", () => {
    it("parses plain JSON response", () => {
      const raw = JSON.stringify({
        title: "My Presentation",
        slides: [
          { title: "Slide 1", content: "Content 1", layout: "title" },
        ],
      });
      const result = parseLlmSlidesResponse(raw);
      expect(result).not.toBeNull();
      expect(result!.title).toBe("My Presentation");
      expect(result!.slides).toHaveLength(1);
      expect(result!.slides[0].layout).toBe("title");
    });

    it("parses JSON inside markdown code block", () => {
      const raw = '```json\n{"title":"T","slides":[{"title":"S","content":"C","layout":"title-content"}]}\n```';
      const result = parseLlmSlidesResponse(raw);
      expect(result).not.toBeNull();
      expect(result!.title).toBe("T");
    });

    it("parses JSON with text before and after", () => {
      const raw = 'Here is your presentation:\n{"title":"T","slides":[{"title":"S","content":"C","layout":"title"}]}\nHope you like it!';
      const result = parseLlmSlidesResponse(raw);
      expect(result).not.toBeNull();
      expect(result!.title).toBe("T");
    });

    it("returns null for invalid JSON", () => {
      const result = parseLlmSlidesResponse("not json at all");
      expect(result).toBeNull();
    });

    it("returns null when slides array is missing", () => {
      const raw = JSON.stringify({ title: "No slides" });
      const result = parseLlmSlidesResponse(raw);
      expect(result).toBeNull();
    });

    it("returns null when slides array is empty", () => {
      const raw = JSON.stringify({ title: "Empty", slides: [] });
      const result = parseLlmSlidesResponse(raw);
      expect(result).toBeNull();
    });

    it("coerces slide fields to strings", () => {
      const raw = JSON.stringify({
        title: "T",
        slides: [{ title: 123, content: "some text", layout: true }],
      });
      const result = parseLlmSlidesResponse(raw);
      expect(result!.slides[0].title).toBe("123");
      expect(result!.slides[0].content).toBe("some text");
      expect(result!.slides[0].layout).toBe("true");
    });

    it("uses default title when title is missing", () => {
      const raw = JSON.stringify({
        slides: [{ title: "S", content: "C", layout: "title" }],
      });
      const result = parseLlmSlidesResponse(raw);
      expect(result!.title).toBe("Présentation générée");
    });

    it("returns null when JSON is obfuscated by extra braces", () => {
      const raw = 'Some text { with braces } and then {"title":"T","slides":[{"title":"S","content":"{nested}","layout":"title"}]}';
      // Parser finds first { which is not valid JSON start; returns null
      const result = parseLlmSlidesResponse(raw);
      expect(result).toBeNull();
    });
  });

  describe("buildStoryChatPrompt", () => {
    const persona = { name: "Consultant", description: "Questions structurées" };

    it("sends the full conversation as distinct user/assistant messages", () => {
      const history = [
        { role: "user" as const, content: "Une présentation sur Debian" },
        { role: "assistant" as const, content: "Quel est le public cible ?" },
        { role: "user" as const, content: "Des IT managers" },
      ];
      const messages = buildStoryChatPrompt(history, persona, "interview", dummyConfig);
      expect(messages[0].role).toBe("system");
      expect(messages.slice(1)).toEqual([
        { role: "user", content: "Une présentation sur Debian" },
        { role: "assistant", content: "Quel est le public cible ?" },
        { role: "user", content: "Des IT managers" },
      ]);
    });

    it("forbids re-asking answered questions in the system prompt", () => {
      const messages = buildStoryChatPrompt([], persona, "interview", dummyConfig);
      expect(messages[0].content).toContain("NE POSE JAMAIS");
      expect(messages[0].content).toContain("UNE seule question");
    });

    it("includes persona name and description", () => {
      const messages = buildStoryChatPrompt([], persona, "brainstorm", dummyConfig);
      expect(messages[0].content).toContain('"Consultant"');
      expect(messages[0].content).toContain("Questions structurées");
    });

    it("includes slide context when provided", () => {
      const messages = buildStoryChatPrompt(
        [],
        persona,
        "brainstorm",
        dummyConfig,
        undefined,
        { index: 2, title: "Architecture", content: "desc", layout: "mermaid" }
      );
      expect(messages[0].content).toContain("slide 3");
      expect(messages[0].content).toContain("Architecture");
      expect(messages[0].content).toContain('"slide"');
    });

    it("omits slide rules without slide context", () => {
      const messages = buildStoryChatPrompt([], persona, "brainstorm", dummyConfig);
      expect(messages[0].content).not.toContain("Focus slide activé");
    });
  });

  describe("parseStoryChatResponse", () => {
    it("parses strict JSON with reply and storytelling", () => {
      const raw = JSON.stringify({ reply: "Bien noté !", storytelling: "Intro\nDev\nConcl" });
      const result = parseStoryChatResponse(raw);
      expect(result.reply).toBe("Bien noté !");
      expect(result.storytelling).toBe("Intro\nDev\nConcl");
      expect(result.slide).toBeUndefined();
    });

    it("parses JSON inside a markdown code block", () => {
      const raw = '```json\n{"reply":"OK","storytelling":"S"}\n```';
      const result = parseStoryChatResponse(raw);
      expect(result.reply).toBe("OK");
      expect(result.storytelling).toBe("S");
    });

    it("parses slide update payload", () => {
      const raw = JSON.stringify({
        reply: "Slide mise à jour.",
        slide: { title: "Nouveau titre", content: "Nouveau contenu", layout: "two-column" },
      });
      const result = parseStoryChatResponse(raw);
      expect(result.slide).toEqual({
        title: "Nouveau titre",
        content: "Nouveau contenu",
        layout: "two-column",
      });
    });

    it("falls back to plain text reply", () => {
      const result = parseStoryChatResponse("Quel est l'objectif de votre présentation ?");
      expect(result.reply).toBe("Quel est l'objectif de votre présentation ?");
      expect(result.storytelling).toBeUndefined();
    });

    it("extracts a Storytelling section from plain text", () => {
      const result = parseStoryChatResponse("Parfait !\n\nStorytelling: Introduction sur Debian.");
      expect(result.storytelling).toBe("Introduction sur Debian.");
      expect(result.reply).toBe("Parfait !");
    });

    it("does not split a reply that merely mentions the word storytelling", () => {
      const result = parseStoryChatResponse(
        "Bien sûr ! Je vais construire le storytelling avec vous. Quel est l'objectif ?"
      );
      expect(result.storytelling).toBeUndefined();
      expect(result.reply).toBe(
        "Bien sûr ! Je vais construire le storytelling avec vous. Quel est l'objectif ?"
      );
    });

    it("ignores a marker without a colon", () => {
      const result = parseStoryChatResponse("On avance.\n\nStorytelling mis à jour demain.");
      expect(result.storytelling).toBeUndefined();
    });
  });

  describe("normalizeLayout", () => {
    it("returns valid layouts unchanged", () => {
      expect(normalizeLayout("title")).toBe("title");
      expect(normalizeLayout("title-content")).toBe("title-content");
      expect(normalizeLayout("two-column")).toBe("two-column");
      expect(normalizeLayout("title-only")).toBe("title-only");
      expect(normalizeLayout("content-only")).toBe("content-only");
      expect(normalizeLayout("image-left")).toBe("image-left");
      expect(normalizeLayout("image-right")).toBe("image-right");
    });

    it("is case-insensitive", () => {
      expect(normalizeLayout("TITLE")).toBe("title");
      expect(normalizeLayout("Title-Content")).toBe("title-content");
    });

    it("trims whitespace", () => {
      expect(normalizeLayout("  title  ")).toBe("title");
    });

    it("falls back to title-content for unknown layout", () => {
      expect(normalizeLayout("unknown")).toBe("title-content");
      expect(normalizeLayout("")).toBe("title-content");
      expect(normalizeLayout("animation")).toBe("title-content");
    });
  });
});
