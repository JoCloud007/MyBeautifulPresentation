import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { JSDOM } from "jsdom";
import mermaid from "mermaid";

const PORT = process.env.PORT || "3051";

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="mermaid"></div></body></html>');
(global as any).document = dom.window.document;
(global as any).window = dom.window;
(global as any).HTMLElement = dom.window.HTMLElement;

mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });

// Serialize mermaid.render calls — it mutates the shared DOM, so concurrent
// renders would overwrite each other's elements and crash.
class Mutex {
  private promise: Promise<unknown> = Promise.resolve();
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.promise.then(fn);
    this.promise = next.catch(() => {});
    return next;
  }
}

const renderMutex = new Mutex();

async function renderMermaid(definition: string): Promise<string> {
  const id = `mermaid-${crypto.randomUUID()}`;
  return renderMutex.run(async () => {
    try {
      const { svg } = await mermaid.render(id, definition);
      return svg;
    } finally {
      // Clean up DOM to prevent unbounded growth
      const el = document.getElementById(id);
      if (el) el.remove();
      const svgEl = document.getElementById(`d${id}`);
      if (svgEl) svgEl.remove();
    }
  });
}

const server = new Server(
  {
    name: "mcp-mermaid-server",
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
        name: "mermaid_render",
        description: "Render a Mermaid diagram definition to SVG",
        inputSchema: {
          type: "object",
          properties: {
            definition: { type: "string", description: "Mermaid diagram definition" },
          },
          required: ["definition"],
        },
      },
      {
        name: "mermaid_validate",
        description: "Validate a Mermaid diagram definition for syntax errors",
        inputSchema: {
          type: "object",
          properties: {
            definition: { type: "string", description: "Mermaid diagram definition" },
          },
          required: ["definition"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const definition = (args?.definition as string) || "";

  switch (name) {
    case "mermaid_render": {
      if (!definition.trim()) {
        return {
          content: [{ type: "text", text: "Error: definition is required." }],
          isError: true,
        };
      }
      try {
        const svg = await renderMermaid(definition);
        return {
          content: [{ type: "text", text: svg }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Render error: ${message}` }],
          isError: true,
        };
      }
    }
    case "mermaid_validate": {
      if (!definition.trim()) {
        return {
          content: [{ type: "text", text: "Error: definition is required." }],
          isError: true,
        };
      }
      try {
        await renderMermaid(definition);
        return {
          content: [{ type: "text", text: "Valid Mermaid diagram." }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Invalid diagram: ${message}` }],
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

// No wildcard CORS: a permissive ACAO let any web page drive the tool
// endpoints from a victim's browser (SEC-009).
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  if (_req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "mcp-mermaid-server" });
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
  // Valid sessionId mandatory — no fallback to another client's transport.
  const sessionId = req.query.sessionId as string;
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).json({ error: "No active SSE transport" });
  }
});

app.listen(PORT, () => {
  console.log(`MCP Mermaid Server listening on port ${PORT}`);
});
