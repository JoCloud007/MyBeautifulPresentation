import { NextRequest, NextResponse } from "next/server";
import { fetchWithPinnedDns } from "@/lib/ssrfGuard";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function cleanBaseUrl(url: string): string {
  let cleaned = normalizeBaseUrl(url);
  const pathsToStrip = [
    "/chat/completions",
    "/models",
    "/api/chat",
    "/api/tags",
  ];
  for (const path of pathsToStrip) {
    if (cleaned.toLowerCase().endsWith(path.toLowerCase())) {
      cleaned = cleaned.slice(0, -path.length);
    }
  }
  return normalizeBaseUrl(cleaned);
}

function isValidLlmUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Generic sanitized error for client responses — raw internal error
 * messages (DNS/connection internals) are never reflected to callers.
 */
function sanitizeDetectError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("timeout") || msg.includes("abort")) {
      return "Request timeout";
    }
    if (msg.includes("ssrf guard")) {
      // Keep the guard's reason: it describes the policy, not internal details.
      return error.message;
    }
  }
  return "Provider detection failed";
}

async function probeEndpoint(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 8000
): Promise<{ ok: boolean; data?: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Goes through the shared SSRF guard: private/reserved IP ranges are
    // blocked (fail-closed) and the connection is pinned to the validated IP.
    const res = await fetchWithPinnedDns(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      timeout: timeoutMs,
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const baseUrl = searchParams.get("baseUrl");
    // API key from the X-Api-Key header — never a query string (SEC-005).
    const apiKey = req.headers.get("x-api-key") || undefined;

    if (!baseUrl || typeof baseUrl !== "string") {
      return NextResponse.json(
        { error: "baseUrl is required" },
        { status: 400 }
      );
    }

    if (!isValidLlmUrl(baseUrl)) {
      return NextResponse.json(
        { error: "Invalid baseUrl" },
        { status: 400 }
      );
    }

    const normalizedBaseUrl = cleanBaseUrl(baseUrl);

    // Try OpenAI-compatible /v1/models endpoint first (covers OpenAI, vLLM, generic-openai)
    const openaiHeaders: Record<string, string> = {};
    if (apiKey) {
      openaiHeaders["Authorization"] = `Bearer ${apiKey}`;
    }

    const openaiProbe = await probeEndpoint(
      `${normalizedBaseUrl}/v1/models`,
      openaiHeaders
    );

    if (openaiProbe.ok && openaiProbe.data) {
      const data = openaiProbe.data as {
        data?: Array<{ id: string }>;
        object?: string;
      };
      const models = (data.data || []).map((m) => m.id);

      // Heuristic: if models contain typical vLLM names or the endpoint is local, mark as vllm
      // Otherwise generic-openai
      let provider: "vllm" | "generic-openai" | "openai" = "generic-openai";
      const urlLower = normalizedBaseUrl.toLowerCase();
      if (
        urlLower.includes("openai.com") ||
        urlLower.includes("api.openai")
      ) {
        provider = "openai";
      } else if (
        urlLower.includes("vllm") ||
        urlLower.includes(":8000") ||
        urlLower.includes(":8080") ||
        models.some((m) =>
          /^(Qwen|Llama|Mixtral|Mistral|DeepSeek|Phi|Gemma)/i.test(m)
        )
      ) {
        provider = "vllm";
      }

      return NextResponse.json({ provider, models });
    }

    // Try Ollama /api/tags endpoint
    const ollamaProbe = await probeEndpoint(
      `${normalizedBaseUrl}/api/tags`
    );

    if (ollamaProbe.ok && ollamaProbe.data) {
      const data = ollamaProbe.data as {
        models?: Array<{ name: string }>;
      };
      const models = (data.models || []).map((m) => m.name);
      return NextResponse.json({ provider: "ollama" as const, models });
    }

    return NextResponse.json(
      {
        provider: null,
        models: [],
        error: "Unable to detect provider. The URL does not respond to known LLM endpoints (/v1/models or /api/tags).",
      },
      { status: 404 }
    );
  } catch (error) {
    console.error("[LLM DETECT] Error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { provider: null, models: [], error: sanitizeDetectError(error) },
      { status: 500 }
    );
  }
}
