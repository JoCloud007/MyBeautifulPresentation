import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST, GET } from "@/app/api/llm/route";
import { NextRequest } from "next/server";

// Mock global fetch for proxy requests
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createNextRequest(options: {
  method?: string;
  url?: string;
  body?: unknown;
  json?: () => Promise<unknown>;
}): NextRequest {
  const url = options.url || "http://localhost:3000/api/llm";
  const req = {
    url,
    method: options.method || "GET",
    json: options.json || (async () => options.body),
  } as unknown as NextRequest;
  return req;
}

describe("Ollama API Route", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
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
            Host: "localhost",
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
          headers: expect.objectContaining({
            Host: "localhost",
          }),
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
});
