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

const ManageDnsInputSchema = z.object({
  operation: z
    .enum([
      "get_nameservers",
      "set_nameservers",
      "get_preferences",
      "set_preferences",
      "get_searchpaths",
      "set_searchpaths",
    ])
    .describe("DNS operation to perform"),
  nameservers: z
    .array(z.string())
    .optional()
    .describe('DNS nameserver addresses (required for "set_nameservers")'),
  magicDNS: z
    .boolean()
    .optional()
    .describe('Enable or disable MagicDNS (required for "set_preferences")'),
  searchPaths: z
    .array(z.string())
    .optional()
    .describe('DNS search paths (required for "set_searchpaths")'),
});

const ManageKeysInputSchema = z.object({
  operation: z
    .enum(["list", "create", "delete"])
    .describe("Auth key operation to perform"),
  keyConfig: z
    .object({
      description: z.string().optional().describe("Human-readable description"),
      expirySeconds: z
        .number()
        .optional()
        .describe("Seconds until the key expires"),
      capabilities: z
        .object({
          devices: z
            .object({
              create: z
                .object({
                  reusable: z.boolean().optional(),
                  ephemeral: z.boolean().optional(),
                  preauthorized: z.boolean().optional(),
                  tags: z.array(z.string()).optional(),
                })
                .optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional()
    .describe('Key capabilities and metadata (required for "create")'),
  keyId: z
    .string()
    .optional()
    .describe('Authentication key ID (required for "delete")'),
});

const TailnetInfoInputSchema = z.object({
  includeDetails: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include advanced configuration details in the output"),
});

export function registerAdminTools(server: McpServer, ctx: ToolContext): void {
  defineTool(server, ctx, {
    name: "manage_dns",
    title: "Manage DNS",
    description:
      "Get or set Tailscale DNS nameservers, MagicDNS preferences, or search paths for the tailnet.",
    inputSchema: ManageDnsInputSchema,
    annotations: { destructiveHint: true },
    async handler(args, toolCtx) {
      const { api } = getDeps(toolCtx);

      switch (args.operation) {
        case "get_nameservers": {
          const result = await api.getDNSNameservers();
          if (!result.success)
            throw new Error(result.error ?? "Failed to get nameservers");
          const ns = result.data?.dns ?? [];
          return `DNS Nameservers:\n${ns.length > 0 ? ns.map((n) => `  - ${n}`).join("\n") : "  No custom nameservers configured"}`;
        }
        case "set_nameservers": {
          if (!args.nameservers)
            throw new Error("nameservers is required for set_nameservers");
          const result = await api.setDNSNameservers(args.nameservers);
          if (!result.success)
            throw new Error(result.error ?? "Failed to set nameservers");
          return `DNS nameservers updated to: ${args.nameservers.join(", ")}`;
        }
        case "get_preferences": {
          const result = await api.getDNSPreferences();
          if (!result.success)
            throw new Error(result.error ?? "Failed to get DNS preferences");
          return `DNS Preferences:\n  MagicDNS: ${result.data?.magicDNS ? "Enabled" : "Disabled"}`;
        }
        case "set_preferences": {
          if (args.magicDNS === undefined)
            throw new Error("magicDNS is required for set_preferences");
          const result = await api.setDNSPreferences(args.magicDNS);
          if (!result.success)
            throw new Error(result.error ?? "Failed to set DNS preferences");
          return `MagicDNS ${args.magicDNS ? "enabled" : "disabled"}`;
        }
        case "get_searchpaths": {
          const result = await api.getDNSSearchPaths();
          if (!result.success)
            throw new Error(result.error ?? "Failed to get search paths");
          const paths = result.data?.searchPaths ?? [];
          return `DNS Search Paths:\n${paths.length > 0 ? paths.map((p) => `  - ${p}`).join("\n") : "  No search paths configured"}`;
        }
        case "set_searchpaths": {
          if (!args.searchPaths)
            throw new Error("searchPaths is required for set_searchpaths");
          const result = await api.setDNSSearchPaths(args.searchPaths);
          if (!result.success)
            throw new Error(result.error ?? "Failed to set search paths");
          return `DNS search paths updated to: ${args.searchPaths.join(", ")}`;
        }
      }
    },
  });

  defineTool(server, ctx, {
    name: "manage_keys",
    title: "Manage Auth Keys",
    description:
      "List, create, or delete Tailscale authentication keys for the tailnet.",
    inputSchema: ManageKeysInputSchema,
    annotations: { destructiveHint: true },
    async handler(args, toolCtx) {
      const { api } = getDeps(toolCtx);

      switch (args.operation) {
        case "list": {
          const result = await api.listAuthKeys();
          if (!result.success)
            throw new Error(result.error ?? "Failed to list auth keys");
          const keys = result.data?.keys ?? [];
          if (keys.length === 0) return "No authentication keys found";
          return (
            `Found ${keys.length} authentication key(s):\n\n` +
            keys
              .map(
                (k, i) =>
                  `Key ${i + 1}:\n  ID: ${k.id}\n  Description: ${k.description ?? "—"}\n  Created: ${k.created}\n  Expires: ${k.expires}\n  Reusable: ${k.capabilities?.devices?.create?.reusable ? "yes" : "no"}\n  Preauthorized: ${k.capabilities?.devices?.create?.preauthorized ? "yes" : "no"}`,
              )
              .join("\n\n")
          );
        }
        case "create": {
          if (!args.keyConfig)
            throw new Error("keyConfig is required for create");
          const createReq = {
            ...args.keyConfig,
            capabilities: {
              devices: {
                create: {
                  ...args.keyConfig.capabilities?.devices?.create,
                },
              },
            },
          };
          const result = await api.createAuthKey(createReq);
          if (!result.success)
            throw new Error(result.error ?? "Failed to create auth key");
          return `Authentication key created:\n  ID: ${result.data?.id}\n  Key: ${result.data?.key}\n  Description: ${result.data?.description ?? "—"}`;
        }
        case "delete": {
          if (!args.keyId) throw new Error("keyId is required for delete");
          const result = await api.deleteAuthKey(args.keyId);
          if (!result.success)
            throw new Error(result.error ?? "Failed to delete auth key");
          return `Authentication key ${args.keyId} deleted successfully`;
        }
      }
    },
  });

  defineTool(server, ctx, {
    name: "tailnet_info",
    title: "Tailnet Info",
    description:
      "Retrieve metadata about the Tailscale tailnet, including DNS settings, security configuration, and optional advanced details.",
    inputSchema: TailnetInfoInputSchema,
    annotations: { readOnlyHint: true },
    async handler(args, toolCtx) {
      const { api } = getDeps(toolCtx);
      const result = await api.getDetailedTailnetInfo();
      if (!result.success)
        throw new Error(result.error ?? "Failed to get tailnet info");
      const info = result.data;
      let out = `Tailnet Information\n\nName: ${info?.name ?? "Unknown"}\nOrganization: ${info?.organization ?? "Unknown"}\nCreated: ${info?.created ?? "Unknown"}\n\nDNS: ${info?.dns ? "Configured" : "Not configured"}\nFile sharing: ${info?.fileSharing ? "Enabled" : "Disabled"}\nService collection: ${info?.serviceCollection ? "Enabled" : "Disabled"}\nNetwork lock: ${info?.networkLockEnabled ? "Enabled" : "Disabled"}`;
      if (args.includeDetails) {
        out += `\n\nKey expiry disabled: ${info?.keyExpiryDisabled ? "yes" : "no"}\nDevice approval required: ${info?.deviceApprovalRequired ? "yes" : "no"}\nMachine authorization timeout: ${info?.machineAuthorizationTimeout ?? "Default"}`;
      }
      return out;
    },
  });
}
