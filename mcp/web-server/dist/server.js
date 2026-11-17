import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { JSDOM } from "jsdom";
const PORT = process.env.PORT || "3053";
const REQUEST_TIMEOUT = Number(process.env.REQUEST_TIMEOUT || "10000");
async function fetchWithTimeout(url, timeoutMs) {
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
    }
    finally {
        clearTimeout(timer);
    }
}
async function webSearch(query, maxResults = 5) {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetchWithTimeout(searchUrl, REQUEST_TIMEOUT);
    if (!response.ok) {
        throw new Error(`Search HTTP ${response.status}: ${response.statusText}`);
    }
    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const results = [];
    const elements = doc.querySelectorAll(".result");
    for (const el of Array.from(elements).slice(0, maxResults)) {
        const htmlEl = el;
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
            }
            else if (!url.startsWith("http")) {
                resolvedUrl = `https://duckduckgo.com${url}`;
            }
            // Extract real URL from DuckDuckGo redirect URLs
            try {
                const ddgo = new URL(resolvedUrl);
                if (ddgo.hostname === "duckduckgo.com" && ddgo.searchParams.has("uddg")) {
                    const realUrl = ddgo.searchParams.get("uddg");
                    if (realUrl)
                        resolvedUrl = realUrl;
                }
            }
            catch {
                // ignore URL parse errors
            }
            results.push({ title, url: resolvedUrl, snippet });
        }
    }
    return results;
}
async function webFetch(url) {
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
            el.remove();
        }
    }
    const title = doc.querySelector("title")?.textContent?.trim() || "";
    // Try to find main content
    let contentEl = doc.querySelector("main") ||
        doc.querySelector("article") ||
        doc.querySelector("[role='main']") ||
        doc.querySelector(".content") ||
        doc.querySelector("#content") ||
        doc.body;
    let content = "";
    if (contentEl) {
        // Extract paragraphs and headings
        const textEls = contentEl.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li");
        const parts = [];
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
const server = new Server({
    name: "mcp-web-server",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "web_search",
                description: "Search the web using DuckDuckGo and return a list of results with titles, URLs, and snippets.",
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
                description: "Fetch a web page and extract its readable text content (title, body text, etc.)",
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
            const query = args?.query || "";
            const maxResults = args?.max_results || 5;
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
                const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`);
                return {
                    content: [{ type: "text", text: lines.join("\n\n") }],
                };
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return {
                    content: [{ type: "text", text: `Search error: ${message}` }],
                    isError: true,
                };
            }
        }
        case "web_fetch": {
            const url = args?.url || "";
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
            }
            catch (err) {
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
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (_req.method === "OPTIONS") {
        res.status(200).end();
        return;
    }
    next();
});
app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "mcp-web-server" });
});
const transports = new Map();
app.get("/sse", async (req, res) => {
    const sessionId = req.query.sessionId || crypto.randomUUID();
    const transport = new SSEServerTransport("/messages", res);
    transports.set(sessionId, transport);
    res.on("close", () => {
        transports.delete(sessionId);
    });
    await server.connect(transport);
});
app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = sessionId
        ? transports.get(sessionId)
        : Array.from(transports.values())[0];
    if (transport) {
        await transport.handlePostMessage(req, res);
    }
    else {
        res.status(400).json({ error: "No active SSE transport" });
    }
});
app.listen(PORT, () => {
    console.log(`MCP Web Server listening on port ${PORT}`);
});
