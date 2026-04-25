import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Logger } from "../logger.ts";

export async function runStdio(server: McpServer, log: Logger): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("stdio MCP server ready");
}
