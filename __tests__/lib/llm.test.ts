import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkOllamaAvailability,
  fetchOllamaModels,
  callOllamaChat,
  streamOllamaChat,
  buildStorytellingPrompt,
  parseLlmSlidesResponse,
  normalizeLayout,
} from "@/lib/llm";
import { LlmConfig, LlmMessage } from "@/app/types/llm";
import { Template } from "@/app/types/template";

const dummyConfig: LlmConfig = {
  provider: "ollama",
  baseUrl: "http://localhost:11434",
  model: "llama3.2",
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: "",
};

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("LLM Storytelling Integration", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────
  // buildStorytellingPrompt
  // ─────────────────────────────────────────────
  describe("buildStorytellingPrompt", () => {
    it("returns a system + user message array", () => {
      const result = buildStorytellingPrompt("My story", dummyConfig);
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe("system");
      expect(result[1].role).toBe("user");
    });

    it("includes storytelling text in the user message", () => {
      const story = "We launched a new product in 2024.";
      const result = buildStorytellingPrompt(story, dummyConfig);
      expect(result[1].content).toContain(story);
    });

    it("includes strict JSON rules in the system prompt", () => {
      const result = buildStorytellingPrompt("Test", dummyConfig);
      expect(result[0].content).toContain("JSON valide");
      expect(result[0].content).toContain("title");
      expect(result[0].content).toContain("slides");
    });

    it("mentions layout options in the system prompt", () => {
      const result = buildStorytellingPrompt("Test", dummyConfig);
      expect(result[0].content).toContain("title-content");
      expect(result[0].content).toContain("two-column");
      expect(result[0].content).toContain("title-only");
      expect(result[0].content).toContain("content-only");
    });

    it("includes template context when a template is provided", () => {
      const template: Template = {
        id: "corporate",
        name: "Corporate Pro",
        description: "Professional corporate style",
        category: "corporate",
        colors: {
          name: "corporate",
          background: "#ffffff",
          foreground: "#1a1a1a",
          accent: "#2563eb",
          secondary: "#64748b",
          muted: "#f1f5f9",
          border: "#e2e8f0",
        },
        fonts: { heading: "Inter", body: "Inter" },
        defaultSlides: [],
      };
      const result = buildStorytellingPrompt("Test", dummyConfig, template);
      expect(result[0].content).toContain("Corporate Pro");
      expect(result[0].content).toContain("Professional corporate style");
    });

    it("does not include template context when no template is provided", () => {
      const result = buildStorytellingPrompt("Test", dummyConfig);
      expect(result[0].content).not.toContain('template "');
    });

    it("sets max 8 slides in the system prompt", () => {
      const result = buildStorytellingPrompt("Test", dummyConfig);
      expect(result[0].content).toContain("Maximum 8 slides");
    });
  });

  // ─────────────────────────────────────────────
  // parseLlmSlidesResponse
  // ─────────────────────────────────────────────
  describe("parseLlmSlidesResponse", () => {
    it("parses clean JSON response", () => {
      const raw = JSON.stringify({
        title: "My Presentation",
        slides: [
          { title: "Slide 1", content: "Content 1", layout: "title" },
          { title: "Slide 2", content: "Content 2", layout: "title-content" },
        ],
      });
      const result = parseLlmSlidesResponse(raw);
      expect(result).not.toBeNull();
      expect(result?.title).toBe("My Presentation");
      expect(result?.slides).toHaveLength(2);
      expect(result?.slides[0].layout).toBe("title");
    });

    it("extracts JSON from markdown code blocks", () => {
      const raw = 'Here is your presentation:\n\n```json\n{"title":"Test","slides":[{"title":"S1","content":"C1","layout":"title"}]}\n```';
      const result = parseLlmSlidesResponse(raw);
      expect(result).not.toBeNull();
      expect(result?.title).toBe("Test");
    });

    it("extracts JSON from plain code blocks (no language tag)", () => {
      const raw = '```\n{"title":"Test","slides":[{"title":"S1","content":"C1","layout":"title"}]}\n```';
      const result = parseLlmSlidesResponse(raw);
      expect(result).not.toBeNull();
      expect(result?.title).toBe("Test");
    });

    it("extracts JSON from text with preamble and postamble", () => {
      const raw = 'Sure! Here is the JSON:\n\n{"title":"Test","slides":[{"title":"S1","content":"C1","layout":"title"}]}\n\nHope this helps!';
      const result = parseLlmSlidesResponse(raw);
      expect(result).not.toBeNull();
      expect(result?.title).toBe("Test");
    });

    it("finds outermost JSON object when multiple braces exist", () => {
      const raw = 'prefix { "title": "Test", "slides": [{"title": "S1", "content": "C1", "layout": "title"}] } suffix';
      const result = parseLlmSlidesResponse(raw);
      expect(result).not.toBeNull();
      expect(result?.title).toBe("Test");
    });

    it("returns default title when title is missing", () => {
      const raw = JSON.stringify({
        slides: [{ title: "Slide 1", content: "Content", layout: "title" }],
      });
      const result = parseLlmSlidesResponse(raw);
      expect(result?.title).toBe("Présentation générée");
    });

    it("returns null when slides array is empty", () => {
      const raw = JSON.stringify({ title: "Test", slides: [] });
      const result = parseLlmSlidesResponse(raw);
      expect(result).toBeNull();
    });

    it("returns null when slides is not an array", () => {
      const raw = JSON.stringify({ title: "Test", slides: "not-an-array" });
      const result = parseLlmSlidesResponse(raw);
      expect(result).toBeNull();
    });

    it("returns null for completely invalid JSON", () => {
      const result = parseLlmSlidesResponse("not json at all");
      expect(result).toBeNull();
    });

    it("returns null for JSON without slides property", () => {
      const raw = JSON.stringify({ title: "Test", other: [] });
      const result = parseLlmSlidesResponse(raw);
      expect(result).toBeNull();
    });

    it("coerces non-string slide fields to strings", () => {
      const raw = JSON.stringify({
        title: "Test",
        slides: [{ title: 123, content: "text", layout: true }],
      });
      const result = parseLlmSlidesResponse(raw);
      expect(result?.slides[0].title).toBe("123");
      expect(result?.slides[0].content).toBe("text");
      expect(result?.slides[0].layout).toBe("true");
    });

    it("defaults null content to empty string", () => {
      const raw = JSON.stringify({
        title: "Test",
        slides: [{ title: "Slide", content: null, layout: "title" }],
      });
      const result = parseLlmSlidesResponse(raw);
      expect(result?.slides[0].content).toBe("");
    });

    it("handles nested braces inside strings correctly", () => {
      const raw = JSON.stringify({
        title: "Test {special}",
        slides: [{ title: "Slide", content: "Has {braces}", layout: "title" }],
      });
      const result = parseLlmSlidesResponse(raw);
      expect(result?.title).toBe("Test {special}");
      expect(result?.slides[0].content).toBe("Has {braces}");
    });

    it("handles multiline JSON in code blocks", () => {
      const raw = '```json\n{\n  "title": "Multi",\n  "slides": [\n    {\n      "title": "S1",\n      "content": "C1",\n      "layout": "title"\n    }\n  ]\n}\n```';
      const result = parseLlmSlidesResponse(raw);
      expect(result).not.toBeNull();
      expect(result?.title).toBe("Multi");
    });
  });

  // ─────────────────────────────────────────────
  // normalizeLayout
  // ─────────────────────────────────────────────
  describe("normalizeLayout", () => {
    it("returns valid layout as-is (lowercase)", () => {
      expect(normalizeLayout("title")).toBe("title");
      expect(normalizeLayout("title-content")).toBe("title-content");
      expect(normalizeLayout("two-column")).toBe("two-column");
    });

    it("normalizes case to lowercase", () => {
      expect(normalizeLayout("TITLE")).toBe("title");
      expect(normalizeLayout("Title-Content")).toBe("title-content");
    });

    it("trims whitespace", () => {
      expect(normalizeLayout("  title  ")).toBe("title");
    });

    it("defaults to 'title-content' for unknown layouts", () => {
      expect(normalizeLayout("unknown")).toBe("title-content");
      expect(normalizeLayout("")).toBe("title-content");
    });

    it("accepts all valid layout values", () => {
      const valid = [
        "title",
        "title-content",
        "two-column",
        "title-only",
        "content-only",
        "image-left",
        "image-right",
      ];
      for (const layout of valid) {
        expect(normalizeLayout(layout)).toBe(layout);
      }
    });
  });

  // ─────────────────────────────────────────────
  // checkOllamaAvailability
  // ─────────────────────────────────────────────
  describe("checkOllamaAvailability", () => {
    it("returns true when API responds OK", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      const result = await checkOllamaAvailability("http://localhost:11434");
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("baseUrl=http%3A%2F%2Flocalhost%3A11434"),
        expect.objectContaining({ method: "GET", signal: expect.any(AbortSignal) })
      );
    });

    it("returns false when API responds with error", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      const result = await checkOllamaAvailability("http://localhost:11434");
      expect(result).toBe(false);
    });

    it("returns false when fetch throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await checkOllamaAvailability("http://localhost:11434");
      expect(result).toBe(false);
    });

    it("passes an AbortSignal to fetch for timeout handling", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      await checkOllamaAvailability("http://localhost:11434");
      const [, options] = mockFetch.mock.calls[0];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    });

    it("URL-encodes the baseUrl parameter", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      await checkOllamaAvailability("http://host:11434/path");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent("http://host:11434/path")),
        expect.anything()
      );
    });
  });

  // ─────────────────────────────────────────────
  // fetchOllamaModels
  // ─────────────────────────────────────────────
  describe("fetchOllamaModels", () => {
    it("returns model names on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: "llama3.2" }, { name: "mistral" }],
        }),
      });
      const result = await fetchOllamaModels("http://localhost:11434");
      expect(result).toEqual(["llama3.2", "mistral"]);
    });

    it("returns empty array when no models field", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });
      const result = await fetchOllamaModels("http://localhost:11434");
      expect(result).toEqual([]);
    });

    it("returns empty array on error response", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      const result = await fetchOllamaModels("http://localhost:11434");
      expect(result).toEqual([]);
    });

    it("returns empty array when fetch throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await fetchOllamaModels("http://localhost:11434");
      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────
  // callOllamaChat
  // ─────────────────────────────────────────────
  describe("callOllamaChat", () => {
    const config: LlmConfig = {
      provider: "ollama",
      baseUrl: "http://localhost:11434",
      model: "llama3.2",
      temperature: 0.7,
      maxTokens: 4096,
      systemPrompt: "You are a helpful assistant.",
    };
    const messages: LlmMessage[] = [
      { role: "user", content: "Hello" },
    ];

    it("returns message content on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: { role: "assistant", content: "Hi there!" },
          done: true,
        }),
      });
      const result = await callOllamaChat(config, messages);
      expect(result).toBe("Hi there!");
    });

    it("sends correct request body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { content: "" }, done: true }),
      });
      await callOllamaChat(config, messages);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/ollama");
      const body = JSON.parse(options.body);
      expect(body).toMatchObject({
        baseUrl: config.baseUrl,
        model: config.model,
        stream: false,
        messages,
      });
      expect(body.options).toMatchObject({
        temperature: config.temperature,
        num_predict: config.maxTokens,
      });
    });

    it("throws on error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "Ollama failed",
      });
      await expect(callOllamaChat(config, messages)).rejects.toThrow("LLM error: 500");
    });

    it("throws with statusText when text() fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: async () => { throw new Error("fail"); },
      });
      await expect(callOllamaChat(config, messages)).rejects.toThrow("LLM error: 503 Service Unavailable");
    });

    it("returns empty string when message content is missing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ done: true }),
      });
      const result = await callOllamaChat(config, messages);
      expect(result).toBe("");
    });

    it("includes Content-Type header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { content: "" }, done: true }),
      });
      await callOllamaChat(config, messages);
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers).toEqual({ "Content-Type": "application/json" });
    });
  });

  // ─────────────────────────────────────────────
  // streamOllamaChat
  // ─────────────────────────────────────────────
  describe("streamOllamaChat", () => {
    const config: LlmConfig = {
      provider: "ollama",
      baseUrl: "http://localhost:11434",
      model: "llama3.2",
      temperature: 0.7,
      maxTokens: 4096,
      systemPrompt: "You are a helpful assistant.",
    };
    const messages: LlmMessage[] = [{ role: "user", content: "Hello" }];

    function createMockReader(chunks: Uint8Array[]) {
      let i = 0;
      return {
        read: vi.fn(async () => {
          if (i < chunks.length) {
            return { done: false, value: chunks[i++] };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };
    }

    it("yields content chunks from streamed response", async () => {
      const chunk1 = new TextEncoder().encode('{"message":{"content":"Hello"}}\n');
      const chunk2 = new TextEncoder().encode('{"message":{"content":" world"}}\n');
      const mockReader = createMockReader([chunk1, chunk2]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const results: string[] = [];
      for await (const chunk of streamOllamaChat(config, messages)) {
        results.push(chunk);
      }
      expect(results).toEqual(["Hello", " world"]);
    });

    it("handles partial lines across reads", async () => {
      const chunk1 = new TextEncoder().encode('{"message":{"content":"Hel');
      const chunk2 = new TextEncoder().encode('lo"}}\n{"message":{"content":" world"}}\n');
      const mockReader = createMockReader([chunk1, chunk2]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const results: string[] = [];
      for await (const chunk of streamOllamaChat(config, messages)) {
        results.push(chunk);
      }
      expect(results).toEqual(["Hello", " world"]);
    });

    it("skips malformed JSON lines", async () => {
      const chunk1 = new TextEncoder().encode('not json\n{"message":{"content":"valid"}}\n');
      const mockReader = createMockReader([chunk1]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const results: string[] = [];
      for await (const chunk of streamOllamaChat(config, messages)) {
        results.push(chunk);
      }
      expect(results).toEqual(["valid"]);
    });

    it("skips lines without message content", async () => {
      const chunk1 = new TextEncoder().encode('{"done":true}\n{"message":{"content":"data"}}\n');
      const mockReader = createMockReader([chunk1]);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const results: string[] = [];
      for await (const chunk of streamOllamaChat(config, messages)) {
        results.push(chunk);
      }
      expect(results).toEqual(["data"]);
    });

    it("throws when response is not ok", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Error",
      });
      await expect(async () => {
        const gen = streamOllamaChat(config, messages);
        await gen.next();
      }).rejects.toThrow("LLM error: 500 Error");
    });

    it("throws when response has no body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
      });
      await expect(async () => {
        const gen = streamOllamaChat(config, messages);
        await gen.next();
      }).rejects.toThrow("LLM error");
    });

    it("sends stream: true in request body", async () => {
      const mockReader = createMockReader([]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });
      const gen = streamOllamaChat(config, messages);
      await gen.next();
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.stream).toBe(true);
    });
  });
});
