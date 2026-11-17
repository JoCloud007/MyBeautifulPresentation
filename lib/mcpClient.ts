import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export interface McpServerConfig {
  name: string;
  url: string;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export class McpClient {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, SSEClientTransport> = new Map();

  async connect(config: McpServerConfig): Promise<void> {
    const transport = new SSEClientTransport(new URL(config.url));
    const client = new Client(
      { name: `frontend-${config.name}`, version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(transport);
    this.clients.set(config.name, client);
    this.transports.set(config.name, transport);
  }

  async listTools(serverName: string): Promise<McpTool[]> {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`Not connected to server: ${serverName}`);
    const response = await client.listTools();
    return response.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`Not connected to server: ${serverName}`);
    return client.callTool({ name: toolName, arguments: args });
  }

  async disconnect(serverName: string): Promise<void> {
    const transport = this.transports.get(serverName);
    if (transport) {
      await transport.close();
      this.transports.delete(serverName);
    }
    this.clients.delete(serverName);
  }

  async disconnectAll(): Promise<void> {
    for (const name of Array.from(this.transports.keys())) {
      await this.disconnect(name);
    }
  }
}

export async function checkMcpServerHealth(url: string): Promise<boolean> {
  try {
    const healthUrl = new URL("/health", url).toString();
    const res = await fetch(healthUrl, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export function getDefaultMcpServers(): McpServerConfig[] {
  return [
    {
      name: "mcp-pptx",
      url: process.env.MCP_PPTX_URL || "http://mcp-pptx:3050",
    },
    {
      name: "mcp-mermaid",
      url: process.env.MCP_MERMAID_URL || "http://mcp-mermaid:3051",
    },
    {
      name: "mcp-excalidraw",
      url: process.env.MCP_EXCALIDRAW_URL || "http://mcp-excalidraw:3052",
    },
    {
      name: "mcp-web",
      url: process.env.MCP_WEB_URL || "http://mcp-web:3053",
    },
  ];
}
