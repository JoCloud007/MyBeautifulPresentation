import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as PptxGenJSModule from "pptxgenjs";
const PptxGenJS = (PptxGenJSModule as any).default || PptxGenJSModule;
type PptxPresentation = any;

const PORT = process.env.PORT || "3050";

// Scoped presentations per session — prevents cross-request corruption
const presentations = new Map<string, PptxPresentation>();

function generateId(): string {
  return crypto.randomUUID();
}

const server = new Server(
  {
    name: "mcp-pptx-server",
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
        name: "pptx_create",
        description: "Create a new blank PPTX presentation and return its ID",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Presentation title" },
          },
          required: [],
        },
      },
      {
        name: "pptx_add_slide",
        description: "Add a slide to a PPTX presentation with optional content",
        inputSchema: {
          type: "object",
          properties: {
            presentationId: { type: "string", description: "ID of the presentation returned by pptx_create" },
            title: { type: "string", description: "Slide title" },
            content: { type: "string", description: "Slide body content" },
            layout: { type: "string", description: "Slide layout name" },
          },
          required: ["presentationId", "title"],
        },
      },
      {
        name: "pptx_export",
        description: "Export a PPTX presentation to a base64 data URL",
        inputSchema: {
          type: "object",
          properties: {
            presentationId: { type: "string", description: "ID of the presentation to export" },
          },
          required: ["presentationId"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "pptx_create": {
      const pres = new PptxGenJS();
      const title = (args?.title as string) || "Untitled";
      pres.title = title;
      pres.author = "MCP PPTX Server";
      const id = generateId();
      presentations.set(id, pres);
      return {
        content: [{ type: "text", text: JSON.stringify({ id, title, message: `Created presentation: ${title}` }) }],
      };
    }
    case "pptx_add_slide": {
      const presentationId = (args?.presentationId as string) || "";
      if (!presentationId || !presentations.has(presentationId)) {
        return {
          content: [{ type: "text", text: "Error: No presentation found for the given presentationId. Call pptx_create first." }],
          isError: true,
        };
      }
      const pres = presentations.get(presentationId)!;
      const slideTitle = (args?.title as string) || "";
      const content = (args?.content as string) || "";
      const slide = pres.addSlide();
      slide.addText(slideTitle, { x: 0.5, y: 0.5, w: "90%", fontSize: 24, bold: true });
      if (content) {
        slide.addText(content, { x: 0.5, y: 1.5, w: "90%", fontSize: 14 });
      }
      return {
        content: [{ type: "text", text: `Added slide: ${slideTitle}` }],
      };
    }
    case "pptx_export": {
      const presentationId = (args?.presentationId as string) || "";
      if (!presentationId || !presentations.has(presentationId)) {
        return {
          content: [{ type: "text", text: "Error: No presentation found for the given presentationId." }],
          isError: true,
        };
      }
      const pres = presentations.get(presentationId)!;
      const buffer = await pres.write({ outputType: "base64" });
      presentations.delete(presentationId);
      return {
        content: [{ type: "text", text: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${buffer}` }],
      };
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
  res.status(200).json({ status: "ok", service: "mcp-pptx-server" });
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
  console.log(`MCP PPTX Server listening on port ${PORT}`);
});
