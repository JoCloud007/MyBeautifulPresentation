import dns from "dns/promises";

/**
 * Shared anti-SSRF guard used by all server-side proxy routes
 * (/api/llm, /api/llm/detect, /api/mcp/health).
 *
 * SECURITY MODEL (fail-closed by design):
 * - Private/reserved ranges are ALWAYS blocked (no NODE_ENV bypass).
 * - Cloud metadata (169.254.169.254) is ALWAYS blocked.
 * - A dev-only escape hatch (LLM_ALLOW_PRIVATE_IPS=true) exists for local
 *   LLM runtimes (Ollama/vLLM). It is NOT tied to NODE_ENV: it must be set
 *   explicitly in the environment and is intended for local single-user
 *   deployments only. The docker-compose app service sets it by default;
 *   any multi-user deployment must remove it.
 * - DNS failure = blocked (no "allow fetch to fail naturally" path).
 * - resolveAndPin returns the resolved IP; callers MUST fetch through
 *   fetchWithPinnedDns (custom undici connect lookup) so the connection is
 *   actually bound to the validated IP (anti DNS-rebinding / TOCTOU).
 */

export function isPrivateOrReservedIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b, c] = parts;
  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 loopback
  if (a === 127) return true;
  // 169.254.0.0/16 link-local (incl. cloud metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 0) return true;
  // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 0 && c === 2) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 benchmark
  if (a === 198 && b >= 18 && b <= 19) return true;
  // 198.51.100.0/24 TEST-NET-2
  if (a === 198 && b === 51 && c === 100) return true;
  // 203.0.113.0/24 TEST-NET-3
  if (a === 203 && b === 0 && c === 113) return true;
  // 240.0.0.0/4 reserved
  if (a >= 240) return true;
  return false;
}

/**
 * Parse an IPv6 literal (with or without brackets, with an optional zone id,
 * with an optional embedded IPv4 tail) into its 8 numeric 16-bit groups.
 * Returns null when the input is not a syntactically valid IPv6 address.
 */
function parseIPv6Groups(addr: string): number[] | null {
  let h = addr.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  const pct = h.indexOf("%");
  if (pct !== -1) h = h.slice(0, pct); // strip zone id (fe80::1%en0)

  // Embedded IPv4 tail (e.g. ::ffff:127.0.0.1) → two hex groups.
  const lastColon = h.lastIndexOf(":");
  const tail = h.slice(lastColon + 1);
  if (tail.includes(".")) {
    const dec = tail
      .split(".")
      .map((p) => (/^0\d+$/.test(p) ? parseInt(p, 8) : parseInt(p, 10)));
    if (dec.length !== 4 || dec.some((n) => isNaN(n) || n < 0 || n > 255)) {
      return null;
    }
    const g1 = ((dec[0] << 8) | dec[1]).toString(16);
    const g2 = ((dec[2] << 8) | dec[3]).toString(16);
    h = h.slice(0, lastColon + 1) + g1 + ":" + g2;
  }

  const validGroups = (groups: string[]) =>
    groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))
      ? groups.map((g) => parseInt(g, 16))
      : null;

  // "::" compression (at most one)
  const sections = h.split("::");
  if (sections.length > 2) return null;
  if (sections.length === 2) {
    const head = sections[0] ? sections[0].split(":") : [];
    const tailGroups = sections[1] ? sections[1].split(":") : [];
    const missing = 8 - head.length - tailGroups.length;
    if (missing < 1) return null; // "::" must stand for at least one group
    return validGroups([...head, ...Array(missing).fill("0"), ...tailGroups]);
  }
  const groups = h.split(":");
  if (groups.length !== 8) return null;
  return validGroups(groups);
}

export function isPrivateOrReservedIPv6(hostname: string): boolean {
  const groups = parseIPv6Groups(hostname);
  if (groups) {
    // :: unspecified
    if (groups.every((g) => g === 0)) return true;
    // ::1 loopback
    if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true;
    // fc00::/7 unique local
    if ((groups[0] & 0xfe00) === 0xfc00) return true;
    // fe80::/10 link-local
    if ((groups[0] & 0xffc0) === 0xfe80) return true;
    // ::ffff:0:0/96 IPv4-mapped — decode the embedded IPv4 numerically so
    // hex-form mappings (::ffff:7f00:1 = 127.0.0.1) are NOT read as public.
    if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
      const hi = groups[6];
      const lo = groups[7];
      return isPrivateOrReservedIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return false;
  }
  // Unparseable input: conservative textual fallback for common prefixes.
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) {
    return true;
  }
  return false;
}

/**
 * Parse a hostname that might be in decimal, octal, or hex notation
 * (e.g. 2130706433, 0x7f000001, 0177.0.0.1) and return the normalized
 * dotted-quad IPv4 string, or null when the input is not a numeric IP.
 */
export function parseNumericIp(hostname: string): string | null {
  // Whole-string decimal (e.g. 2130706433 = 127.0.0.1).
  if (/^\d+$/.test(hostname) && hostname.length > 3) {
    const num = parseInt(hostname, 10);
    if (num <= 0xffffffff) {
      return [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff].join(".");
    }
  }
  // Whole-string hex (e.g. 0x7f000001).
  if (/^0x[0-9a-fA-F]+$/.test(hostname)) {
    const num = parseInt(hostname, 16);
    if (num <= 0xffffffff) {
      return [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff].join(".");
    }
  }
  // NOTE: no 4-part octal fallback here — "127.0.0.1" is a DECIMAL dotted
  // quad, not an octal one (the old fallback reinterpreted it as 87.0.0.1,
  // silently allowing loopback). Dotted quads are decoded in
  // resolveAndValidateHostname with browser rules: decimal parts, octal
  // only when a part has a leading zero.
  return null;
}

function privateIpsAllowed(): boolean {
  // Dev-only escape hatch for local LLM runtimes. Never derived from NODE_ENV.
  return process.env.LLM_ALLOW_PRIVATE_IPS === "true";
}

export interface HostValidation {
  valid: boolean;
  reason?: string;
  /** The IP the connection must be pinned to (set when valid). */
  resolvedIp?: string;
  /** True when the host was allowed via the explicit private-IP escape hatch. */
  allowedPrivate?: boolean;
}

/**
 * Validate a hostname for outbound fetching. Fail-closed: returns
 * { valid: false } on any private/reserved hit, cloud-metadata hit, or
 * DNS resolution failure. Loopback names/IPs are evaluated like any other
 * private address (blocked unless the explicit escape hatch is on).
 */
export async function resolveAndValidateHostname(hostname: string): Promise<HostValidation> {
  const allowPrivate = privateIpsAllowed();

  // IPv6 literal (or bracketed IPv6)
  if (hostname.includes(":")) {
    if (isPrivateOrReservedIPv6(hostname)) {
      return allowPrivate
        ? { valid: true, resolvedIp: hostname.replace(/^\[|\]$/g, ""), allowedPrivate: true }
        : { valid: false, reason: "private/reserved IPv6 address" };
    }
    return { valid: true, resolvedIp: hostname.replace(/^\[|\]$/g, "") };
  }

  // Numeric IP encodings (whole-string decimal / hex)
  const numericIp = parseNumericIp(hostname);
  if (numericIp) {
    if (isPrivateOrReservedIp(numericIp)) {
      return allowPrivate
        ? { valid: true, resolvedIp: numericIp, allowedPrivate: true }
        : { valid: false, reason: "numeric encoding of a private/reserved IP" };
    }
    return { valid: true, resolvedIp: numericIp };
  }

  // Dotted IPv4 literal — decode like WHATWG (URL) does: parts are decimal
  // unless they carry a leading zero, which makes them octal. This closes
  // the 0-prefixed bypass (e.g. 0177.0.0.1) without misreading "127.0.0.1".
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    const parts = hostname.split(".");
    const decoded = parts.map((p) =>
      /^0\d+$/.test(p) ? parseInt(p, 8) : parseInt(p, 10)
    );
    if (decoded.some((n) => isNaN(n) || n < 0 || n > 255)) {
      return { valid: false, reason: "malformed IPv4 literal" };
    }
    const ip = decoded.join(".");
    if (isPrivateOrReservedIp(ip)) {
      return allowPrivate
        ? { valid: true, resolvedIp: ip, allowedPrivate: true }
        : { valid: false, reason: "private/reserved IPv4 address" };
    }
    return { valid: true, resolvedIp: ip };
  }

  // RFC 6761: "localhost" (and *.localhost) always refers to loopback.
  // Handle it explicitly — system resolvers are unreliable for it
  // (e.g. macOS resolves it via lookup, not via resolve4/resolve6).
  const lowerHost = hostname.toLowerCase();
  if (lowerHost === "localhost" || lowerHost.endsWith(".localhost")) {
    return allowPrivate
      ? { valid: true, resolvedIp: "127.0.0.1", allowedPrivate: true }
      : { valid: false, reason: "loopback host" };
  }

  // Real hostname: resolve and validate every record. Fail closed on errors.
  try {
    const addresses = await dns.resolve4(hostname);
    if (addresses.length === 0) {
      return { valid: false, reason: "no A record" };
    }
    for (const ip of addresses) {
      if (isPrivateOrReservedIp(ip)) {
        return allowPrivate
          ? { valid: true, resolvedIp: addresses[0], allowedPrivate: true }
          : { valid: false, reason: `hostname resolves to private/reserved IP (${ip})` };
      }
    }
    return { valid: true, resolvedIp: addresses[0] };
  } catch {
    try {
      const addresses6 = await dns.resolve6(hostname);
      if (addresses6.length === 0) {
        return { valid: false, reason: "no AAAA record" };
      }
      for (const ip of addresses6) {
        if (isPrivateOrReservedIPv6(ip)) {
          return allowPrivate
            ? { valid: true, resolvedIp: addresses6[0], allowedPrivate: true }
            : { valid: false, reason: `hostname resolves to private/reserved IPv6 (${ip})` };
        }
      }
      return { valid: true, resolvedIp: addresses6[0] };
    } catch (err6) {
      return {
        valid: false,
        reason: `DNS resolution failed (${err6 instanceof Error ? (err6 as NodeJS.ErrnoException).code || err6.message : "unknown"})`,
      };
    }
  }
}

interface PinnedFetchInit extends RequestInit {
  timeout?: number;
}

function undiciTypes() {
  // Undici is a Next.js transitive dependency; import lazily like the
  // previous route-local code did, with the minimal typing surface we need.
  return import("undici") as unknown as Promise<{
    Agent: new (opts: unknown) => unknown;
    fetch: (url: string, init: unknown) => Promise<Response>;
  }>;
}

/**
 * Fetch a URL after SSRF validation, pinning the TCP connection to the
 * validated IP (custom undici connect lookup) so a second DNS lookup at
 * connect time cannot rebind the hostname to a private address.
 * TLS verification is always on — no caller can disable it.
 */
export async function fetchWithPinnedDns(
  url: string,
  init: PinnedFetchInit = {}
): Promise<Response> {
  const parsed = new URL(url);
  const validation = await resolveAndValidateHostname(parsed.hostname);
  if (!validation.valid || !validation.resolvedIp) {
    throw new Error(`Blocked by SSRF guard: ${validation.reason || "invalid host"}`);
  }
  const pinnedIp = validation.resolvedIp;
  const isIpLiteral =
    /^(\d{1,3}\.){3}\d{1,3}$/.test(pinnedIp) || pinnedIp.includes(":");

  const controller = new AbortController();
  const timeout = init.timeout || 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    if (isIpLiteral) {
      // Nothing to pin — the URL already points at the validated IP.
      return await fetch(url, { ...init, signal: controller.signal });
    }

    const { Agent, fetch: undiciFetch } = await undiciTypes();
    const dispatcher = new Agent({
      connect: {
        lookup: (
          _hostname: string,
          _options: unknown,
          callback: (err: NodeJS.ErrnoException | null, address?: string, family?: number) => void
        ) => {
          callback(null, pinnedIp, pinnedIp.includes(":") ? 6 : 4);
        },
      },
    });
    return await undiciFetch(url, { ...init, signal: controller.signal, dispatcher });
  } finally {
    clearTimeout(timeoutId);
  }
}
