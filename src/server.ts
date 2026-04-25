import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./lib/tool.ts";
import { registerAllTools } from "./tools/index.ts";

export function createMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: "tailscale-mcp-server", version: "1.0.0-rc.1" },
    { capabilities: { tools: {}, resources: {}, prompts: {}, logging: {} } },
  );
  registerAllTools(server, ctx);
  return server;
}
