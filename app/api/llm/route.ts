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

/**
 * Parse a hostname string that might be in decimal, octal, or hex notation.
 * Returns the normalized IPv4 string or null if not a numeric IP.
 */
function parseNumericIp(hostname: string): string | null {
  // Try decimal (e.g., 2130706433)
  if (/^\d+$/.test(hostname) && hostname.length > 3) {
    const num = parseInt(hostname, 10);
    if (num <= 0xFFFFFFFF) {
      return [
        (num >>> 24) & 0xFF,
        (num >>> 16) & 0xFF,
        (num >>> 8) & 0xFF,
        num & 0xFF,
      ].join(".");
    }
  }

  // Try hex (e.g., 0x7f000001)
  if (/^0x[0-9a-fA-F]+$/.test(hostname)) {
    const num = parseInt(hostname, 16);
    if (num <= 0xFFFFFFFF) {
      return [
        (num >>> 24) & 0xFF,
        (num >>> 16) & 0xFF,
        (num >>> 8) & 0xFF,
        num & 0xFF,
      ].join(".");
    }
  }

  // Try octal parts (e.g., 0177.0.0.1)
  const octalParts = hostname.split(".");
  if (
    octalParts.length === 4 &&
    octalParts.every((p) => /^[0-7]+$/.test(p))
  ) {
    return octalParts.map((p) => String(parseInt(p, 8))).join(".");
  }

  return null;
}

function isPrivateOrReservedIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((p) => isNaN(p) || p < 0 || p > 255)
  ) {
    return false;
  }
  const [a, b] = parts;

  // 127.0.0.0/8 loopback
  if (a === 127) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 link-local
  if (a === 169 && b === 254) return true;
  // 0.0.0.0/8
  if (a === 0) return true;
  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (TEST-NET)
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  // 192.0.0.0/24
  if (a === 192 && b === 0 && parts[2] === 0) return true;
  // 198.18.0.0/15 benchmark
  if (a === 198 && b >= 18 && b <= 19) return true;
  // 240.0.0.0/4 reserved
  if (a >= 240) return true;

  return false;
}

function isCloudMetadataIp(ip: string): boolean {
  return ip === "169.254.169.254";
}

function isPrivateOrReservedIPv6(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  // Remove brackets if present
  const h = lower.replace(/^\[/, "").replace(/\]$/, "");

  // ::1 loopback
  if (
    h === "::1" ||
    h === "0:0:0:0:0:0:0:1" ||
    h === "::ffff:127.0.0.1"
  )
    return true;
  // :: loopback/unspecified
  if (h === "::" || h === "0:0:0:0:0:0:0:0") return true;
  // fc00::/7 unique local
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  // fe80::/10 link-local
  if (
    h.startsWith("fe8") ||
    h.startsWith("fe9") ||
    h.startsWith("fea") ||
    h.startsWith("feb")
  )
    return true;
  // ::ffff:0:0/96 IPv4-mapped - check the IPv4 part
  if (h.startsWith("::ffff:")) {
    const ipv4Part = h.replace("::ffff:", "");
    return isPrivateOrReservedIp(ipv4Part);
  }

  return false;
}

async function resolveAndValidateHostname(
  hostname: string
): Promise<{ valid: boolean; resolvedIp?: string }> {
  // Check raw hostname first
  if (isPrivateOrReservedIPv6(hostname)) {
    return {
      valid: process.env.NODE_ENV === "development",
      resolvedIp: hostname,
    };
  }

  // Try numeric IP variants
  const numericIp = parseNumericIp(hostname);
  if (numericIp) {
    return {
      valid:
        process.env.NODE_ENV === "development" ||
        !isPrivateOrReservedIp(numericIp),
      resolvedIp: numericIp,
    };
  }

  // Check if it's already an IP literal
  const ipv4Match = hostname.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  );
  if (ipv4Match) {
    const ip = hostname;
    if (isCloudMetadataIp(ip)) {
      return { valid: false, resolvedIp: ip };
    }
    return {
      valid:
        process.env.NODE_ENV === "development" ||
        !isPrivateOrReservedIp(ip),
      resolvedIp: ip,
    };
  }

  // For hostnames, perform DNS resolution and validate the result
  try {
    const dns = await import("dns");
    const addresses = await dns.promises.resolve4(hostname);
    if (addresses.length === 0) return { valid: false };

    for (const ip of addresses) {
      if (isCloudMetadataIp(ip) || isPrivateOrReservedIp(ip)) {
        return {
          valid: process.env.NODE_ENV === "development",
          resolvedIp: ip,
        };
      }
    }
    return { valid: true, resolvedIp: addresses[0] };
  } catch {
    // DNS resolution failed - could be IPv6 only or invalid hostname
    try {
      const dns = await import("dns");
      const addresses = await dns.promises.resolve6(hostname);
      if (addresses.length === 0) return { valid: false };
      for (const ip of addresses) {
        if (isPrivateOrReservedIPv6(ip)) {
          return {
            valid: process.env.NODE_ENV === "development",
            resolvedIp: ip,
          };
        }
      }
      return { valid: true, resolvedIp: addresses[0] };
    } catch {
      // Cannot resolve - block to be safe
      return { valid: false };
    }
  }
}

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

function getErrorDetails(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

async function fetchWithDnsPinning(
  url: string,
  init: RequestInit & { timeout?: number; skipSslVerification?: boolean }
): Promise<Response> {
  const parsed = new URL(url);
  const hostname = parsed.hostname;

  // Validate and resolve hostname (anti-SSRF)
  const validation = await resolveAndValidateHostname(hostname);
  if (!validation.valid) {
    throw new Error("Invalid baseUrl: resolved to private/reserved IP");
  }

  // Apply timeout
  const controller = new AbortController();
  const timeout = init.timeout || 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log(`[LLM fetch] ${init.method || "GET"} ${url}`);

    if (init.skipSslVerification) {
      const undici = await import("undici") as unknown as {
        Agent: new (opts: { connect: { rejectUnauthorized: boolean } }) => unknown;
        fetch: (url: string, init: unknown) => Promise<Response>;
      };
      const dispatcher = new undici.Agent({
        connect: { rejectUnauthorized: false },
      });
      const res = await undici.fetch(url, {
        ...init,
        signal: controller.signal,
        dispatcher,
      });
      console.log(`[LLM fetch] Response status: ${res.status}`);
      return res;
    }

    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    console.log(`[LLM fetch] Response status: ${res.status}`);
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { baseUrl, provider, apiKey, skipSslVerification, ...providerBody } = body;

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
    const isOpenAI = provider === "openai";
    // OpenAI baseUrl already includes /v1 (e.g. https://api.openai.com/v1)
    const endpoint = isOpenAI ? "/chat/completions" : "/api/chat";

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

    const res = await fetchWithDnsPinning(
      `${normalizedBaseUrl}${endpoint}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(providerBody),
        timeout: 120000,
        skipSslVerification: !!skipSslVerification,
      }
    );

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
    const apiKey = searchParams.get("apiKey");
    const skipSslVerification = searchParams.get("skipSslVerification") === "true";

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
    const isOpenAI = provider === "openai";
    // OpenAI baseUrl already includes /v1
    const endpoint = isOpenAI ? "/models" : "/api/tags";

    const headers: Record<string, string> = {};
    if (isOpenAI && apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetchWithDnsPinning(
      `${normalizedBaseUrl}${endpoint}`,
      {
        method: "GET",
        headers,
        timeout: 10000,
        skipSslVerification,
      }
    );

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
    if (details.stack) console.error(details.stack);

    const devInfo = process.env.NODE_ENV === "development" ? details : undefined;
    const message = sanitizeError(error);
    return NextResponse.json(
      { error: message, details: devInfo },
      { status: 500 }
    );
  }
}
