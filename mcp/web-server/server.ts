import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { JSDOM } from "jsdom";

const PORT = process.env.PORT || "3053";
const REQUEST_TIMEOUT = Number(process.env.REQUEST_TIMEOUT || "10000");

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function webSearch(query: string, maxResults = 5): Promise<SearchResult[]> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(searchUrl, REQUEST_TIMEOUT);
  if (!response.ok) {
    throw new Error(`Search HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const results: SearchResult[] = [];
  const elements = doc.querySelectorAll(".result");

  for (const el of Array.from(elements).slice(0, maxResults)) {
    const htmlEl = el as Element;
    const titleEl = htmlEl.querySelector(".result__a");
    const snippetEl = htmlEl.querySelector(".result__snippet");
    const urlEl = htmlEl.querySelector(".result__url");

    const title = titleEl?.textContent?.trim() || "";
    const url = titleEl?.getAttribute("href") || urlEl?.textContent?.trim() || "";
    const snippet = snippetEl?.textContent?.trim() || "";

    if (title && url) {
      // DuckDuckGo HTML uses protocol-relative or relative redirects
      let resolvedUrl = url;
      if (url.startsWith("//")) {
        resolvedUrl = `https:${url}`;
      } else if (!url.startsWith("http")) {
        resolvedUrl = `https://duckduckgo.com${url}`;
      }
      // Extract real URL from DuckDuckGo redirect URLs
      try {
        const ddgo = new URL(resolvedUrl);
        if (ddgo.hostname === "duckduckgo.com" && ddgo.searchParams.has("uddg")) {
          const realUrl = ddgo.searchParams.get("uddg");
          if (realUrl) resolvedUrl = realUrl;
        }
      } catch {
        // ignore URL parse errors
      }
      results.push({ title, url: resolvedUrl, snippet });
    }
  }

  return results;
}

function isAllowedPublicHttpUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    // Dotted IPv4 literal — resolve and check every octet form is normalized
    // away by rejecting the common private/reserved prefixes outright.
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(":"); // IPv6 literal
  return !blocked;
}

async function webFetch(url: string): Promise<{ title: string; content: string; url: string }> {
  if (!isAllowedPublicHttpUrl(url)) {
    throw new Error("Blocked: web_fetch only accepts public http(s) URLs");
  }
  const response = await fetchWithTimeout(url, REQUEST_TIMEOUT);
  if (!response.ok) {
    throw new Error(`Fetch HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  // Remove script and style elements
  for (const tag of ["script", "style", "nav", "footer", "header", "aside"]) {
    for (const el of Array.from(doc.querySelectorAll(tag))) {
      (el as Element).remove();
    }
  }

  const title = doc.querySelector("title")?.textContent?.trim() || "";

  // Try to find main content
  let contentEl =
    doc.querySelector("main") ||
    doc.querySelector("article") ||
    doc.querySelector("[role='main']") ||
    doc.querySelector(".content") ||
    doc.querySelector("#content") ||
    doc.body;

  let content = "";
  if (contentEl) {
    // Extract paragraphs and headings
    const textEls = contentEl.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li");
    const parts: string[] = [];
    for (const el of Array.from(textEls)) {
      const text = el.textContent?.trim();
      if (text && text.length > 20) {
        parts.push(text);
      }
    }
    content = parts.join("\n\n");
  }

  // Fallback to body text if no good content found
  if (!content || content.length < 200) {
    content = doc.body?.textContent?.replace(/\s+/g, " ").trim() || "";
  }

  // Limit content length
  const maxLength = 8000;
  if (content.length > maxLength) {
    content = content.slice(0, maxLength) + "\n\n[Content truncated...]";
  }

  return { title, content, url };
}

const server = new Server(
  {
    name: "mcp-web-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "web_search",
        description:
          "Search the web using DuckDuckGo and return a list of results with titles, URLs, and snippets.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query string",
            },
            max_results: {
              type: "number",
              description: "Maximum number of results to return (default 5)",
              default: 5,
            },
          },
          required: ["query"],
        },
      },
      {
        name: "web_fetch",
        description:
          "Fetch a web page and extract its readable text content (title, body text, etc.)",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "Full URL of the page to fetch",
            },
          },
          required: ["url"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "web_search": {
      const query = (args?.query as string) || "";
      const maxResults = (args?.max_results as number) || 5;
      if (!query.trim()) {
        return {
          content: [{ type: "text", text: "Error: query is required." }],
          isError: true,
        };
      }
      try {
        const results = await webSearch(query, maxResults);
        if (results.length === 0) {
          return {
            content: [{ type: "text", text: "No results found." }],
          };
        }
        const lines = results.map(
          (r, i) =>
            `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`
        );
        return {
          content: [{ type: "text", text: lines.join("\n\n") }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Search error: ${message}` }],
          isError: true,
        };
      }
    }
    case "web_fetch": {
      const url = (args?.url as string) || "";
      if (!url.trim()) {
        return {
          content: [{ type: "text", text: "Error: url is required." }],
          isError: true,
        };
      }
      try {
        const result = await webFetch(url);
        const text = `Title: ${result.title}\nURL: ${result.url}\n\n${result.content}`;
        return {
          content: [{ type: "text", text }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Fetch error: ${message}` }],
          isError: true,
        };
      }
    }
    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

const app = express();

app.use((_req, res, next) => {
  // No wildcard CORS: these services are consumed same-origin / from the
  // app backend. A permissive ACAO let any web page drive the tools from a
  // victim's browser (SEC-009). Health checks from the browser still work
  // because they are simple GETs (no custom headers → no preflight).
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  if (_req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "mcp-web-server" });
});

const transports = new Map<string, SSEServerTransport>();

app.get("/sse", async (_req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  // Register under the transport's OWN session id: the SDK generates it and
  // hands it to clients via the endpoint event. Registering under a
  // query-provided/random key made every POST /messages fail the lookup.
  transports.set(transport.sessionId, transport);
  res.on("close", () => {
    transports.delete(transport.sessionId);
  });
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  // A valid sessionId is MANDATORY: falling back to "first available
  // transport" let any caller inject messages into another client's session.
  const sessionId = req.query.sessionId as string;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).json({ error: "No active SSE transport" });
  }
});

app.listen(PORT, () => {
  console.log(`MCP Web Server listening on port ${PORT}`);
});
