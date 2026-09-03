import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { AppConfig } from "../config/env.js";
import { registerPrompts } from "../mcp/prompts/index.js";
import { registerResources } from "../mcp/resources/index.js";
import { registerTools } from "../mcp/tools/index.js";
import { withNormalizedToolSchemas } from "../mcp/transports/schema-dialect.js";
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

  const context = { config, logger, tailscale: service };
  registerTools(server, context);
  registerResources(server, context);
  registerPrompts(server);

  // The SDK advertises tool schemas as draft-07 with no way to change the
  // conversion target, and clients that compile `outputSchema` against a
  // 2020-12-only validator reject every tool. Normalize the dialect on the way
  // out. Wrapped here, at the single place the server is built, so that every
  // transport inherits it instead of each having to remember.
  // TODO(sdk#2084): drop this wrapper once the SDK emits 2020-12 — see
  // ../mcp/schemas/json-schema-dialect.ts for the upstream issues and PRs.
  const connect = server.connect.bind(server);
  server.connect = (transport: Transport): Promise<void> =>
    connect(withNormalizedToolSchemas(transport));

  return server;
}
