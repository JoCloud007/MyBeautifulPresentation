const ALLOWED_MCP_HOSTS = [
  "mcp-pptx",
  "mcp-mermaid",
  "mcp-excalidraw",
  "mcp-web",
  "localhost",
  "127.0.0.1",
];

/**
 * SSRF-hardened URL validation for the MCP health probe:
 * - http scheme only
 * - host in the service allowlist
 * - empty path (the route appends /health itself)
 * - no query string, no credentials, no fragment
 * This prevents using the endpoint as a port-scan / error-leak primitive
 * (previously any path/port on an allowed host was fetchable and the raw
 * error string was reflected back to the caller).
 */
/**
 * Allowed ports come from the deployment's MCP_*_PORT env (set by
 * docker-compose) with the shipped defaults. Without this restriction the
 * unauthenticated route doubles as a port scanner for loopback services
 * (e.g. ?url=http://127.0.0.1:5432/).
 */
function allowedMcpPorts(): number[] {
  return [
    Number(process.env.MCP_PPTX_PORT || 3050),
    Number(process.env.MCP_MERMAID_PORT || 3051),
    Number(process.env.MCP_EXCALIDRAW_PORT || 3052),
    Number(process.env.MCP_WEB_PORT || 3053),
  ];
}

function isAllowedMcpUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:") return false;
  if (!ALLOWED_MCP_HOSTS.includes(parsed.hostname)) return false;
  if (parsed.pathname !== "/" && parsed.pathname !== "") return false;
  if (parsed.search || parsed.hash) return false;
  if (parsed.username || parsed.password) return false;
  if (!allowedMcpPorts().includes(parsed.port ? Number(parsed.port) : 80)) {
    return false;
  }
  return true;
}

function sanitizeHealthError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return "Health check timed out";
  }
  return "MCP service unreachable";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  if (!url) {
    return Response.json({ ok: false, error: "Missing url parameter" }, { status: 400 });
  }

  if (!isAllowedMcpUrl(url)) {
    return Response.json({ ok: false, error: "URL not allowed" }, { status: 403 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    return Response.json({ ok: res.ok, status: res.status });
  } catch (error) {
    // Generic message only — never reflect String(error) internals.
    return Response.json({ ok: false, error: sanitizeHealthError(error) }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
