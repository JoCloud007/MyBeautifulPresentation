import { NextRequest, NextResponse } from "next/server";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
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

function isValidOllamaUrl(url: string): boolean {
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

function validateOllamaBody(body: Record<string, unknown>): {
  valid: boolean;
  error?: string;
} {
  if (typeof body.model !== "string" || body.model.length === 0) {
    return { valid: false, error: "model is required" };
  }

  // Validate options if present
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
    // Only return generic messages, never stack traces or internal details
    const msg = error.message.toLowerCase();
    if (msg.includes("timeout") || msg.includes("abort")) {
      return "Request timeout";
    }
    if (
      msg.includes("enotfound") ||
      msg.includes("econnrefused")
    ) {
      return "Unable to connect to Ollama";
    }
    return "Proxy request failed";
  }
  return "An unexpected error occurred";
}

async function fetchWithDnsPinning(
  url: string,
  init: RequestInit & { timeout?: number }
): Promise<Response> {
  const parsed = new URL(url);
  const hostname = parsed.hostname;

  // Validate and resolve hostname
  const validation = await resolveAndValidateHostname(hostname);
  if (!validation.valid) {
    throw new Error("Invalid baseUrl: resolved to private/reserved IP");
  }

  // Rebuild URL with resolved IP if needed, keeping the original Host header
  let targetUrl = url;
  if (validation.resolvedIp && validation.resolvedIp !== hostname) {
    parsed.hostname = validation.resolvedIp;
    targetUrl = parsed.toString();
  }

  // Apply timeout
  const controller = new AbortController();
  const timeout = init.timeout || 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(targetUrl, {
      ...init,
      signal: controller.signal,
      // Ensure Host header matches original hostname for virtual hosting
      headers: {
        ...init.headers,
        Host: hostname,
      },
    });

    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { baseUrl, ...ollamaBody } = body;

    if (!baseUrl || typeof baseUrl !== "string") {
      return NextResponse.json(
        { error: "baseUrl is required" },
        { status: 400 }
      );
    }

    if (!isValidOllamaUrl(baseUrl)) {
      return NextResponse.json(
        { error: "Invalid baseUrl" },
        { status: 400 }
      );
    }

    const validation = validateOllamaBody(ollamaBody);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

    const res = await fetchWithDnsPinning(
      `${normalizedBaseUrl}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ollamaBody),
        timeout: 60000,
      }
    );

    if (!res.ok) {
      // Sanitize response to avoid leaking backend details
      return NextResponse.json(
        { error: `Ollama error: ${res.status}` },
        { status: res.status }
      );
    }

    // For streaming, proxy the response directly with proper headers
    if (ollamaBody.stream) {
      return new NextResponse(res.body, {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    const message = sanitizeError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const baseUrl = searchParams.get("baseUrl");

    if (!baseUrl || typeof baseUrl !== "string") {
      return NextResponse.json(
        { error: "baseUrl is required" },
        { status: 400 }
      );
    }

    if (!isValidOllamaUrl(baseUrl)) {
      return NextResponse.json(
        { error: "Invalid baseUrl" },
        { status: 400 }
      );
    }

    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

    const res = await fetchWithDnsPinning(
      `${normalizedBaseUrl}/api/tags`,
      {
        method: "GET",
        timeout: 10000,
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Ollama error: ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    const message = sanitizeError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
