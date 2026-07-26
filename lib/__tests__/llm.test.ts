import { describe, it, expect } from "vitest";
import {
  buildStorytellingPrompt,
  parseLlmSlidesResponse,
  normalizeLayout,
} from "../llm";
import { LlmConfig } from "@/app/types/llm";
import { Template } from "@/app/types/template";

const dummyConfig: LlmConfig = {
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
