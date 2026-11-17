import { NextRequest, NextResponse } from "next/server";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

/**
 * Strip known endpoint paths that users sometimes paste into baseUrl.
 * e.g. "https://api.openai.com/v1/chat/completions" → "https://api.openai.com/v1"
 */
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

import { fetchWithPinnedDns } from "@/lib/ssrfGuard";

function isValidLlmUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Allow http/https only
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function validateLlmBody(body: Record<string, unknown>): {
  valid: boolean;
  error?: string;
} {
  if (typeof body.model !== "string" || body.model.length === 0) {
    return { valid: false, error: "model is required" };
  }

  // Validate options if present (Ollama format)
  if (body.options && typeof body.options === "object") {
    const opts = body.options as Record<string, unknown>;

    if (opts.temperature !== undefined) {
      const temp = Number(opts.temperature);
      if (isNaN(temp) || temp < 0 || temp > 2) {
        return {
          valid: false,
          error: "temperature must be between 0 and 2",
        };
      }
    }

    if (opts.num_predict !== undefined) {
      const num = Number(opts.num_predict);
      if (isNaN(num) || num < 1 || num > 32768) {
        return {
          valid: false,
          error: "num_predict must be between 1 and 32768",
        };
      }
    }

    if (opts.top_p !== undefined) {
      const topP = Number(opts.top_p);
      if (isNaN(topP) || topP < 0 || topP > 1) {
        return { valid: false, error: "top_p must be between 0 and 1" };
      }
    }

    if (opts.top_k !== undefined) {
      const topK = Number(opts.top_k);
      if (isNaN(topK) || topK < 1 || topK > 1000) {
        return { valid: false, error: "top_k must be between 1 and 1000" };
      }
    }
  }

  // Validate top-level temperature / max_tokens (OpenAI format)
  if (body.temperature !== undefined) {
    const temp = Number(body.temperature);
    if (isNaN(temp) || temp < 0 || temp > 2) {
      return {
        valid: false,
        error: "temperature must be between 0 and 2",
      };
    }
  }

  if (body.max_tokens !== undefined) {
    const num = Number(body.max_tokens);
    if (isNaN(num) || num < 1 || num > 32768) {
      return {
        valid: false,
        error: "max_tokens must be between 1 and 32768",
      };
    }
  }

  // Validate messages if present
  if (body.messages && Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (typeof msg !== "object" || msg === null) {
        return { valid: false, error: "Invalid message format" };
      }
      const m = msg as Record<string, unknown>;
      if (!["system", "user", "assistant"].includes(String(m.role))) {
        return { valid: false, error: "Invalid message role" };
      }
      if (typeof m.content !== "string") {
        return {
          valid: false,
          error: "Message content must be a string",
        };
      }
    }
  }

  return { valid: true };
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("timeout") || msg.includes("abort")) {
      return "Request timeout";
    }
    if (
      msg.includes("enotfound") ||
      msg.includes("econnrefused")
    ) {
      return "Unable to connect to LLM";
    }
    return "Proxy request failed";
  }
  return "An unexpected error occurred";
}

function getErrorDetails(error: unknown): { message: string; stack?: string; cause?: unknown } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack, cause: (error as Error & { cause?: unknown }).cause };
  }
  return { message: String(error) };
}

/**
 * Fetch an LLM endpoint through the shared SSRF guard with DNS pinning.
 * TLS certificate verification is ALWAYS enabled — the previous
 * client-controlled skipSslVerification bypass (MITM exposure) was removed.
 */
async function fetchLlm(
  url: string,
  init: RequestInit & { timeout?: number }
): Promise<Response> {
  return fetchWithPinnedDns(url, init);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // NOTE: the API key is read from the X-Api-Key header, never from the
    // JSON body or query string (SEC-005: keys must not transit in URLs).
    const apiKey = req.headers.get("x-api-key") || undefined;
    const { baseUrl, provider, ...providerBody } = body;
    // apiKey must never be forwarded to the provider inside the body.
    delete providerBody.apiKey;

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
    const isOpenAI = provider === "openai" || provider === "vllm" || provider === "generic-openai";
    // OpenAI-compatible baseUrl may or may not include /v1
    const hasV1 = normalizedBaseUrl.toLowerCase().endsWith("/v1");
    const prefix = isOpenAI && !hasV1 ? "/v1" : "";
    const endpoint = isOpenAI ? `${prefix}/chat/completions` : "/api/chat";

    const validation = validateLlmBody(providerBody);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (isOpenAI && apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetchLlm(`${normalizedBaseUrl}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(providerBody),
      timeout: 120000,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "No response body");
      return NextResponse.json(
        { error: `Provider error ${res.status}: ${errorText.slice(0, 500)}` },
        { status: res.status }
      );
    }

    // For streaming, proxy the response directly with proper headers
    if (providerBody.stream) {
      return new NextResponse(res.body, {
        status: 200,
        headers: {
          "Content-Type": isOpenAI
            ? "text/event-stream"
            : "application/x-ndjson",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    const details = getErrorDetails(error);
    console.error("[LLM API POST] Error:", details.message);
    if (details.cause) console.error("[LLM API POST] Cause:", details.cause);
    if (details.stack) console.error(details.stack);

    const devInfo = process.env.NODE_ENV === "development" ? details : undefined;
    const message = sanitizeError(error);
    return NextResponse.json(
      { error: message, details: devInfo },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const baseUrl = searchParams.get("baseUrl");
    const provider = searchParams.get("provider");
    // API key comes from the X-Api-Key header (never a query param — SEC-005).
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
    const isOpenAI = provider === "openai" || provider === "vllm" || provider === "generic-openai";
    // OpenAI-compatible baseUrl may or may not include /v1
    const hasV1 = normalizedBaseUrl.toLowerCase().endsWith("/v1");
    const prefix = isOpenAI && !hasV1 ? "/v1" : "";
    const endpoint = isOpenAI ? `${prefix}/models` : "/api/tags";

    const headers: Record<string, string> = {};
    if (isOpenAI && apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetchLlm(`${normalizedBaseUrl}${endpoint}`, {
      method: "GET",
      headers,
      timeout: 10000,
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "No response body");
      return NextResponse.json(
        { error: `Provider error ${res.status}: ${errorText.slice(0, 500)}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    const details = getErrorDetails(error);
    console.error("[LLM API GET] Error:", details.message);
    if (details.cause) console.error("[LLM API GET] Cause:", details.cause);
    if (details.stack) console.error(details.stack);

    const devInfo = process.env.NODE_ENV === "development" ? details : undefined;
    const message = sanitizeError(error);
    return NextResponse.json(
      { error: message, details: devInfo },
      { status: 500 }
    );
  }
}
