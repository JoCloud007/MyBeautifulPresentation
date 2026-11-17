import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const PORT = process.env.PORT || "3052";

interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  roughness?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  angle?: number;
  points?: number[][];
  startBinding?: unknown;
  endBinding?: unknown;
}

interface ExcalidrawScene {
  elements: ExcalidrawElement[];
  appState?: Record<string, unknown>;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeSvgAttr(value: string): string {
  return value.replace(/"/g, "&quot;");
}

// ─── Numeric / color hardening ───────────────────────────────────────────────
// Every numeric field is coerced to a finite, bounded number before being
// interpolated into a double-quoted SVG attribute: a raw value like
// `" onclick=alert(1) x="` (or 1e999 → Infinity) would otherwise break out
// of the attribute and inject arbitrary SVG/HTML into the rendered output.

/** Coerce to a finite number inside [min, max]; fall back when invalid. */
function safeNum(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (typeof n !== "number" || !isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Drop everything that cannot appear in an SVG color/paint value. */
function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : fallback;
}

function renderToSvg(scene: ExcalidrawScene): string {
  const elements = scene.elements || [];
  if (elements.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#ffffff"/></svg>';
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    // Same coercion as the render loop so a hostile element can neither
    // inject into the viewBox attribute nor poison it with Infinity/NaN.
    const ex = safeNum(el.x, 0, -100000, 100000);
    const ey = safeNum(el.y, 0, -100000, 100000);
    const w = safeNum(el.width, 100, 0, 100000);
    const h = safeNum(el.height, 100, 0, 100000);
    minX = Math.min(minX, ex);
    minY = Math.min(minY, ey);
    maxX = Math.max(maxX, ex + w);
    maxY = Math.max(maxY, ey + h);
  }

  const padding = 20;
  const viewX = minX - padding;
  const viewY = minY - padding;
  const viewW = Math.max(maxX - minX + padding * 2, 100);
  const viewH = Math.max(maxY - minY + padding * 2, 100);

  const shapes: string[] = [];
  for (const el of elements) {
    // All numerics are coerced/bounded once, then only the coerced values
    // are interpolated. Points are filtered to finite pairs.
    const x = safeNum(el.x, 0, -100000, 100000);
    const y = safeNum(el.y, 0, -100000, 100000);
    const w = safeNum(el.width, 100, 0, 100000);
    const h = safeNum(el.height, 100, 0, 100000);
    const angle = safeNum(el.angle, 0, -2 * Math.PI, 2 * Math.PI);
    const sw = safeNum(el.strokeWidth, 1, 0, 100);
    const opacity = safeNum(el.opacity, 100, 0, 100) / 100;
    const fs = safeNum(el.fontSize, 20, 1, 500);

    const cx = x + w / 2;
    const cy = y + h / 2;
    const transform =
      angle !== 0 ? `transform="rotate(${(angle * 180) / Math.PI}, ${cx}, ${cy})"` : "";
    const stroke = sanitizeSvgAttr(safeColor(el.strokeColor, "#000000"));
    const fill = sanitizeSvgAttr(safeColor(el.backgroundColor, "transparent"));

    const rawPts = Array.isArray(el.points) ? el.points : [];
    const pts = rawPts
      .filter(
        (p): p is number[] =>
          Array.isArray(p) &&
          p.length >= 2 &&
          Number.isFinite(Number(p[0])) &&
          Number.isFinite(Number(p[1]))
      )
      .map((p) => [
        safeNum(p[0], 0, -100000, 100000),
        safeNum(p[1], 0, -100000, 100000),
      ]);

    switch (el.type) {
      case "rectangle": {
        shapes.push(
          `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${transform} opacity="${opacity}"/>`
        );
        break;
      }
      case "ellipse": {
        const rx = w / 2;
        const ry = h / 2;
        shapes.push(
          `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${transform} opacity="${opacity}"/>`
        );
        break;
      }
      case "diamond": {
        const points = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
        shapes.push(
          `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${transform} opacity="${opacity}"/>`
        );
        break;
      }
      case "line":
      case "arrow": {
        const pathPts = pts.length > 0 ? pts : [[0, 0], [w, 0]];
        const d = pathPts.map((p, i) => `${i === 0 ? "M" : "L"} ${x + p[0]} ${y + p[1]}`).join(" ");
        shapes.push(
          `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" ${transform} opacity="${opacity}"/>`
        );
        break;
      }
      case "text": {
        shapes.push(
          `<text x="${x}" y="${y + fs}" font-size="${fs}" fill="${stroke}" ${transform} opacity="${opacity}">${escapeXml(el.text || "")}</text>`
        );
        break;
      }
      case "freedraw": {
        if (pts.length > 1) {
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${x + p[0]} ${y + p[1]}`).join(" ");
          shapes.push(
            `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" ${transform} opacity="${opacity}"/>`
          );
        }
        break;
      }
      default: {
        shapes.push(
          `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${transform} opacity="${opacity}"/>`
        );
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewX} ${viewY} ${viewW} ${viewH}" width="${viewW}" height="${viewH}"><rect x="${viewX}" y="${viewY}" width="${viewW}" height="${viewH}" fill="#ffffff"/>${shapes.join("")}</svg>`;
}

function validateScene(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof data !== "object" || data === null) {
    errors.push("Data must be an object");
    return { valid: false, errors };
  }
  const scene = data as ExcalidrawScene;
  if (!Array.isArray(scene.elements)) {
    errors.push("Missing or invalid 'elements' array");
  } else {
    for (const el of scene.elements) {
      if (typeof el !== "object" || el === null) {
        errors.push("Element must be an object");
        continue;
      }
      if (!el.id) errors.push("Element missing 'id'");
      if (!el.type) errors.push("Element missing 'type'");
      if (typeof el.x !== "number") errors.push("Element missing 'x'");
      if (typeof el.y !== "number") errors.push("Element missing 'y'");
    }
  }
  return { valid: errors.length === 0, errors };
}

const server = new Server(
  {
    name: "mcp-excalidraw-server",
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
        name: "excalidraw_render",
        description: "Render an Excalidraw scene to SVG",
        inputSchema: {
          type: "object",
          properties: {
            scene: {
              type: "object",
              description: "Excalidraw scene JSON with elements array",
            },
          },
          required: ["scene"],
        },
      },
      {
        name: "excalidraw_validate",
        description: "Validate an Excalidraw scene JSON structure",
        inputSchema: {
          type: "object",
          properties: {
            scene: {
              type: "object",
              description: "Excalidraw scene JSON with elements array",
            },
          },
          required: ["scene"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const scene = (args?.scene as ExcalidrawScene) || null;

  switch (name) {
    case "excalidraw_render": {
      if (!scene) {
        return {
          content: [{ type: "text", text: "Error: scene is required." }],
          isError: true,
        };
      }
      const validation = validateScene(scene);
      if (!validation.valid) {
        return {
          content: [{ type: "text", text: `Validation failed: ${validation.errors.join(", ")}` }],
          isError: true,
        };
      }
      const svg = renderToSvg(scene);
      return {
        content: [{ type: "text", text: svg }],
      };
    }
    case "excalidraw_validate": {
      if (!scene) {
        return {
          content: [{ type: "text", text: "Error: scene is required." }],
          isError: true,
        };
      }
      const validation = validateScene(scene);
      if (validation.valid) {
        return {
          content: [{ type: "text", text: "Valid Excalidraw scene." }],
        };
      } else {
        return {
          content: [{ type: "text", text: `Invalid scene: ${validation.errors.join(", ")}` }],
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
app.use(express.json({ limit: "10mb" }));

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
  res.status(200).json({ status: "ok", service: "mcp-excalidraw-server" });
});

const transports = new Map<string, SSEServerTransport>();

app.get("/sse", async (_req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  // Register under the transport's OWN session id: the SDK generates it and
  // hands it to clients via the endpoint event. This also prevents one
  // client's POST from being routed into another client's session.
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
  console.log(`MCP Excalidraw Server listening on port ${PORT}`);
});
