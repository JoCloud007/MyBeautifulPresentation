import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { McpClient, getDefaultMcpServers, checkMcpServerHealth } from "@/lib/mcpClient";
import { Presentation } from "@/app/types/presentation";
import { Template } from "@/app/types/template";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Export a presentation via the MCP PPTX server for high-fidelity output.
 * Falls back silently if the server is unreachable or lacks an export tool.
 */
export async function exportPresentationWithMcp(
  presentation: Presentation,
  template?: Template
): Promise<boolean> {
  try {
    const servers = getDefaultMcpServers();
    const pptxServer = servers.find((s) => s.name === "mcp-pptx");
    if (!pptxServer) return false;

    const healthy = await checkMcpServerHealth(pptxServer.url);
    if (!healthy) return false;

    const client = new McpClient();
    await client.connect(pptxServer);

    const tools = await client.listTools("mcp-pptx");
    const exportTool = tools.find(
      (t) =>
        t.name.includes("export") ||
        t.name.includes("pptx") ||
        t.name.includes("presentation")
    );

    if (!exportTool) {
      await client.disconnect("mcp-pptx");
      return false;
    }

    await client.callTool("mcp-pptx", exportTool.name, {
      presentation,
      template,
    });

    await client.disconnect("mcp-pptx");
    return true;
  } catch {
    return false;
  }
}
