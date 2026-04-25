import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "../lib/tool.ts";
import { defineTool } from "../lib/tool.ts";
import type { TailscaleAPI } from "../tailscale/tailscale-api.ts";
import type { TailscaleCLI } from "../tailscale/tailscale-cli.ts";

interface ToolDeps {
  api: TailscaleAPI;
  cli: TailscaleCLI;
  log: ToolContext["log"];
}

function getDeps(ctx: ToolContext): ToolDeps {
  const api = ctx.api as TailscaleAPI | undefined;
  const cli = ctx.cli as TailscaleCLI | undefined;
  if (!api || !cli) throw new Error("ToolContext missing api/cli");
  return { api, cli, log: ctx.log };
}

const AclRuleSchema = z.object({
  action: z.enum(["accept", "drop"]).describe("Rule action"),
  src: z.array(z.string()).describe("Source principals"),
  dst: z.array(z.string()).describe("Destination principals"),
});

const ManageAclInputSchema = z.object({
  operation: z
    .enum(["get", "update", "validate"])
    .describe(
      'ACL operation: "get" fetches the current ACL, "update" replaces it, "validate" checks a config for errors',
    ),
  aclConfig: z
    .object({
      acls: z.array(AclRuleSchema).optional().describe("Access control rules"),
      groups: z
        .record(z.string(), z.array(z.string()))
        .optional()
        .describe("User group definitions"),
      tagOwners: z
        .record(z.string(), z.array(z.string()))
        .optional()
        .describe("Tag ownership mapping"),
    })
    .optional()
    .describe(
      'ACL configuration object (required for "update"; used for "validate", defaults to fetching current ACL)',
    ),
});

export function registerAclTools(server: McpServer, ctx: ToolContext): void {
  defineTool(server, ctx, {
    name: "manage_acl",
    title: "Manage ACL",
    description:
      "Get, update, or validate the Tailscale Access Control List (ACL) policy for the tailnet.",
    inputSchema: ManageAclInputSchema,
    annotations: { destructiveHint: true },
    async handler(args, toolCtx) {
      const { api } = getDeps(toolCtx);

      switch (args.operation) {
        case "get": {
          const result = await api.getACL();
          if (!result.success) {
            throw new Error(result.error ?? "Failed to get ACL");
          }
          const text =
            typeof result.data === "string"
              ? result.data
              : JSON.stringify(result.data, null, 2);
          return `Current ACL configuration:\n\n${text}`;
        }

        case "update": {
          if (!args.aclConfig) {
            throw new Error("aclConfig is required for the update operation");
          }
          const result = await api.updateACL(
            JSON.stringify(args.aclConfig, null, 2),
          );
          if (!result.success) {
            throw new Error(result.error ?? "Failed to update ACL");
          }
          return "ACL configuration updated successfully";
        }

        case "validate": {
          let configString: string;
          if (args.aclConfig) {
            configString = JSON.stringify(args.aclConfig, null, 2);
          } else {
            const current = await api.getACL();
            if (!current.success) {
              throw new Error(
                current.error ?? "Failed to fetch current ACL for validation",
              );
            }
            configString =
              typeof current.data === "string"
                ? current.data
                : JSON.stringify(current.data, null, 2);
          }
          const result = await api.validateACL(configString);
          if (!result.success) {
            throw new Error(result.error ?? "ACL validation failed");
          }
          return "ACL configuration is valid";
        }
      }
    },
  });
}
