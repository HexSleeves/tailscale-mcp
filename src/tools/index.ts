import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../lib/tool.ts";
import { registerAclTools } from "./acl.ts";
import { registerAdminTools } from "./admin.ts";
import { registerDeviceTools } from "./devices.ts";
import { registerNetworkTools } from "./network.ts";

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  registerDeviceTools(server, ctx);
  registerNetworkTools(server, ctx);
  registerAclTools(server, ctx);
  registerAdminTools(server, ctx);
}
