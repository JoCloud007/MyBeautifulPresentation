import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST, GET } from "@/app/api/llm/route";
import { GET as DETECT_GET } from "@/app/api/llm/detect/route";
import { NextRequest } from "next/server";

// Mock global fetch for proxy requests
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createNextRequest(options: {
  method?: string;
  url?: string;
  body?: unknown;
  json?: () => Promise<unknown>;
  headers?: Record<string, string>;
}): NextRequest {
  const url = options.url || "http://localhost:3000/api/llm";
  const req = {
    url,
    method: options.method || "GET",
    json: options.json || (async () => options.body),
    headers: new Headers(options.headers || {}),
  } as unknown as NextRequest;
  return req;
}

describe("Ollama API Route", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    // The docker-compose app service sets this by default (local Ollama);
    // individual security tests override it to assert fail-closed behavior.
    vi.stubEnv("LLM_ALLOW_PRIVATE_IPS", "true");
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ─────────────────────────────────────────────
  // POST handler
  // ─────────────────────────────────────────────
  describe("POST", () => {
    it("proxies chat request to Ollama and returns JSON", async () => {
      const ollamaResponse = {
        message: { role: "assistant", content: "Hello!" },
        done: true,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ollamaResponse,
      });

      const req = createNextRequest({
        method: "POST",
        body: {
          baseUrl: "http://localhost:11434",
          model: "llama3.2",
          messages: [{ role: "user", content: "Hi" }],
          stream: false,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual(ollamaResponse);

      // Verify it called Ollama correctly (DNS resolves localhost → 127.0.0.1)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/chat$/),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: expect.stringContaining("llama3.2"),
        })
      );
    });

    it("returns 400 when baseUrl is missing", async () => {
      const req = createNextRequest({
        method: "POST",
        body: { model: "llama3.2", messages: [] },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("baseUrl is required");
    });

    it("returns error status when Ollama responds with error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "model not found",
      });

      const req = createNextRequest({
        method: "POST",
        body: {
          baseUrl: "http://localhost:11434",
          model: "missing-model",
          messages: [],
          stream: false,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("Provider error 404");
    });

    it("returns 500 on proxy exception", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const req = createNextRequest({
        method: "POST",
        body: {
          baseUrl: "http://localhost:11434",
          model: "llama3.2",
          messages: [],
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("Proxy request failed");
    });

    it("proxies streaming response with correct headers", async () => {
      const mockStream = new ReadableStream();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      const req = createNextRequest({
        method: "POST",
        body: {
          baseUrl: "http://localhost:11434",
          model: "llama3.2",
          messages: [],
          stream: true,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");
      expect(res.headers.get("Cache-Control")).toBe("no-cache");
      expect(res.headers.get("Connection")).toBe("keep-alive");
    });

    it("strips baseUrl from proxied body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ done: true }),
      });

      const req = createNextRequest({
        method: "POST",
        body: {
          baseUrl: "http://localhost:11434",
          model: "llama3.2",
          messages: [{ role: "user", content: "test" }],
          stream: false,
          options: { temperature: 0.7 },
        },
      });

      await POST(req);
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).not.toHaveProperty("baseUrl");
      expect(body).toHaveProperty("model");
      expect(body).toHaveProperty("messages");
      expect(body).toHaveProperty("options");
    });
  });

  // ─────────────────────────────────────────────
  // GET handler
  // ─────────────────────────────────────────────
  describe("GET", () => {
    it("proxies tags request and returns models list", async () => {
      const ollamaResponse = {
        models: [{ name: "llama3.2" }, { name: "mistral" }],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ollamaResponse,
      });

      const req = createNextRequest({
        url: "http://localhost:3000/api/llm?baseUrl=http%3A%2F%2Flocalhost%3A11434",
      });

      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual(ollamaResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/tags$/),
        expect.objectContaining({
          method: "GET",
        })
      );
    });

    it("returns 400 when baseUrl query param is missing", async () => {
      const req = createNextRequest({
        url: "http://localhost:3000/api/llm",
      });

      const res = await GET(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("baseUrl is required");
    });

    it("returns error status when Ollama tags endpoint fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "Service Unavailable",
      });

      const req = createNextRequest({
        url: "http://localhost:3000/api/llm?baseUrl=http%3A%2F%2Flocalhost%3A11434",
      });

      const res = await GET(req);
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toContain("Provider error 503");
    });

    it("returns 500 on proxy exception", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network unreachable"));

      const req = createNextRequest({
        url: "http://localhost:3000/api/llm?baseUrl=http%3A%2F%2Flocalhost%3A11434",
      });

      const res = await GET(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("Proxy request failed");
    });
  });

  // ─────────────────────────────────────────────
  // Security — SSRF guard (fail-closed) and API key handling
  // ─────────────────────────────────────────────
  describe("Security", () => {
    beforeEach(() => {
      vi.stubEnv("LLM_ALLOW_PRIVATE_IPS", "");
    });

    it("blocks baseUrl resolving to a private IP even in development", async () => {
      const req = createNextRequest({
        method: "POST",
        body: {
          baseUrl: "http://169.254.169.254/latest/meta-data",
          model: "llama3.2",
          messages: [{ role: "user", content: "Hi" }],
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("Proxy request failed");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("blocks numeric private IP encodings (hex 0x7f000001)", async () => {
      vi.stubEnv("LLM_ALLOW_PRIVATE_IPS", "");
      const req = createNextRequest({
        method: "POST",
        body: {
          baseUrl: "http://0x7f000001:11434",
          model: "llama3.2",
          messages: [{ role: "user", content: "Hi" }],
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("blocks non-resolvable hostnames (fail-closed DNS)", async () => {
      const req = createNextRequest({
        method: "POST",
        body: {
          baseUrl: "http://nonexistent.invalid",
          model: "llama3.2",
          messages: [{ role: "user", content: "Hi" }],
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("allows local Ollama when LLM_ALLOW_PRIVATE_IPS=true and proxies via pinned fetch", async () => {
      vi.stubEnv("LLM_ALLOW_PRIVATE_IPS", "true");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { role: "assistant", content: "Hello!" }, done: true }),
      });

      const req = createNextRequest({
        method: "POST",
        body: {
          baseUrl: "http://localhost:11434",
          model: "llama3.2",
          messages: [{ role: "user", content: "Hi" }],
          stream: false,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
    });

    it("does not forward an apiKey from the request body (header-only)", async () => {
      vi.stubEnv("LLM_ALLOW_PRIVATE_IPS", "true");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { content: "ok" }, done: true }),
      });

      const req = createNextRequest({
        method: "POST",
        body: {
          baseUrl: "http://localhost:11434",
          model: "llama3.2",
          messages: [{ role: "user", content: "Hi" }],
          apiKey: "sk-leak-in-body",
        },
      });

      await POST(req);
      const [, options] = mockFetch.mock.calls[0];
      expect(JSON.stringify(options.body)).not.toContain("sk-leak-in-body");
    });

    it("returns 400 when baseUrl is missing on GET", async () => {
      const req = createNextRequest({ url: "http://localhost:3000/api/llm" });
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────
  // vLLM / generic-openai provider support
  // ─────────────────────────────────────────────
  describe("Provider routing", () => {
    it("routes vllm provider to /v1/chat/completions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Hi" } }] }),
      });

      const req = createNextRequest({
        method: "POST",
        body: {
          baseUrl: "http://localhost:8000",
          provider: "vllm",
          model: "qwen2.5",
          messages: [{ role: "user", content: "Hello" }],
          stream: false,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/chat\/completions$/),
        expect.anything()
      );
    });

    it("routes generic-openai provider to /v1/chat/completions when baseUrl lacks /v1", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Hi" } }] }),
      });

      const req = createNextRequest({
        method: "POST",
        body: {
          baseUrl: "http://localhost:8080",
          provider: "generic-openai",
          model: "llama3",
          messages: [{ role: "user", content: "Hello" }],
          stream: false,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/chat\/completions$/),
        expect.anything()
      );
    });

    it("does not duplicate /v1 when baseUrl already ends with /v1", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "Hi" } }] }),
      });

      const req = createNextRequest({
        method: "POST",
        body: {
          baseUrl: "http://localhost:8080/v1",
          provider: "generic-openai",
          model: "llama3",
          messages: [{ role: "user", content: "Hello" }],
          stream: false,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).not.toMatch(/\/v1\/v1\//);
      expect(calledUrl).toMatch(/\/v1\/chat\/completions$/);
    });
  });

  // ─────────────────────────────────────────────
  // Detect route
  // ─────────────────────────────────────────────
  describe("GET /api/llm/detect", () => {
    it("detects OpenAI-compatible provider and returns models", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object: "list",
          data: [
            { id: "gpt-4o", object: "model" },
            { id: "gpt-4o-mini", object: "model" },
          ],
        }),
      });

      const req = createNextRequest({
        url: "http://localhost:3000/api/llm/detect?baseUrl=https%3A%2F%2Fapi.openai.com%2Fv1",
        headers: { "x-api-key": "sk-test" },
      });

      const res = await DETECT_GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.provider).toBe("openai");
      expect(data.models).toEqual(["gpt-4o", "gpt-4o-mini"]);
    });

    it("detects vLLM provider by local port heuristic", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object: "list",
          data: [{ id: "Qwen2.5-7B", object: "model" }],
        }),
      });

      const req = createNextRequest({
        url: "http://localhost:3000/api/llm/detect?baseUrl=http%3A%2F%2Flocalhost%3A8000",
      });

      const res = await DETECT_GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.provider).toBe("vllm");
      expect(data.models).toEqual(["Qwen2.5-7B"]);
    });

    it("detects Ollama provider when /v1/models fails but /api/tags succeeds", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            models: [{ name: "llama3.2" }, { name: "mistral" }],
          }),
        });

      const req = createNextRequest({
        url: "http://localhost:3000/api/llm/detect?baseUrl=http%3A%2F%2Flocalhost%3A11434",
      });

      const res = await DETECT_GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.provider).toBe("ollama");
      expect(data.models).toEqual(["llama3.2", "mistral"]);
    });

    it("returns 404 when no provider can be detected", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" })
        .mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" });

      const req = createNextRequest({
        url: "http://localhost:3000/api/llm/detect?baseUrl=http%3A%2F%2Flocalhost%3A9999",
      });

      const res = await DETECT_GET(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.provider).toBeNull();
      expect(data.models).toEqual([]);
      expect(data.error).toContain("Unable to detect provider");
    });

    it("returns 400 when baseUrl is missing", async () => {
      const req = createNextRequest({
        url: "http://localhost:3000/api/llm/detect",
      });

      const res = await DETECT_GET(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("baseUrl is required");
    });
  });
});
