import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config/env.js";
import { registerPrompts } from "../mcp/prompts/index.js";
import { registerResources } from "../mcp/resources/index.js";
import { advertiseToolSchemasAs2020_12 } from "../mcp/schemas/json-schema-dialect.js";
import { registerTools } from "../mcp/tools/index.js";
import type { AppLogger } from "../observability/logger.js";
import { TailscaleService } from "../tailscale/service.js";

export interface ServerFactoryContext {
  config: AppConfig;
  logger: AppLogger;
  tailscale?: TailscaleService;
}

export async function createMcpServer({
  config,
  logger,
  tailscale,
}: ServerFactoryContext): Promise<McpServer> {
  const service =
    tailscale ?? (await TailscaleService.create({ config, logger }));

  const server = new McpServer(
    {
      name: "tailscale-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        logging: {},
      },
    },
  );

  // The SDK advertises tool schemas as draft-07 with no way to change the
  // conversion target, and clients that compile `outputSchema` against a
  // 2020-12-only validator reject every tool. Must run before registerTools:
  // the SDK installs the tools/list handler on the first registered tool.
  // TODO(sdk#2084): drop once the SDK emits 2020-12 — see
  // ../mcp/schemas/json-schema-dialect.ts for the upstream issues and PRs.
  advertiseToolSchemasAs2020_12(server);

  const context = { config, logger, tailscale: service };
  registerTools(server, context);
  registerResources(server, context);
  registerPrompts(server);

  return server;
}
