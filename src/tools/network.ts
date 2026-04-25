import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "../lib/tool.ts";
import { defineTool } from "../lib/tool.ts";
import type { TailscaleAPI } from "../tailscale/tailscale-api.ts";
import type { TailscaleCLI } from "../tailscale/tailscale-cli.ts";
import type { TailscaleCLIStatus } from "../types.ts";

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

const NetworkStatusInputSchema = z.object({
  format: z
    .enum(["json", "summary"])
    .optional()
    .default("json")
    .describe(
      'Output format: "json" for raw JSON or "summary" for human-readable text',
    ),
});

const PingPeerInputSchema = z.object({
  target: z
    .string()
    .describe("Hostname or IP address of the target peer device"),
  count: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(4)
    .describe("Number of ping packets to send (1–100)"),
});

const TailscaleUpInputSchema = z.object({
  acceptRoutes: z
    .boolean()
    .optional()
    .default(false)
    .describe("Accept subnet routes advertised by other devices"),
  acceptDNS: z
    .boolean()
    .optional()
    .default(false)
    .describe("Accept DNS configuration from the tailnet"),
  hostname: z
    .string()
    .optional()
    .describe("Override the hostname this device reports to the tailnet"),
  advertiseRoutes: z
    .array(z.string())
    .optional()
    .describe("CIDR routes to advertise to other devices"),
  authKey: z
    .string()
    .optional()
    .describe("Authentication key for unattended setup"),
  loginServer: z.string().optional().describe("Custom coordination server URL"),
});

function buildSummary(status: TailscaleCLIStatus): string {
  let out = "Tailscale Network Status\n\n";
  out += `Version: ${status.Version}\n`;
  out += `Backend state: ${status.BackendState}\n`;
  out += `TUN interface: ${status.TUN ? "Active" : "Inactive"}\n`;
  out += `Tailscale IPs: ${(status.TailscaleIPs ?? []).join(", ")}\n\n`;
  out += "This device:\n";
  out += `  Hostname: ${status.Self.HostName}\n`;
  out += `  DNS name: ${status.Self.DNSName}\n`;
  out += `  OS: ${status.Self.OS}\n`;
  out += `  IPs: ${status.Self.TailscaleIPs.join(", ")}\n`;
  out += `  Online: ${status.Self.Online ? "yes" : "no"}\n`;
  if (status.Self.ExitNode) out += "  Exit node: yes\n";
  if (status.Peer && Object.keys(status.Peer).length > 0) {
    const peers = Object.values(status.Peer);
    out += `\nConnected peers (${peers.length}):\n`;
    for (const peer of peers) {
      out += `  [${peer.Online ? "online" : "offline"}] ${peer.HostName} (${peer.DNSName})\n`;
      out += `    OS: ${peer.OS}  IPs: ${peer.TailscaleIPs.join(", ")}\n`;
    }
  }
  return out;
}

export function registerNetworkTools(
  server: McpServer,
  ctx: ToolContext,
): void {
  defineTool(server, ctx, {
    name: "network_status",
    title: "Network Status",
    description:
      "Get the current Tailscale network status via the CLI, either as raw JSON or a human-readable summary.",
    inputSchema: NetworkStatusInputSchema,
    annotations: { readOnlyHint: true },
    async handler(args, toolCtx) {
      const { cli } = getDeps(toolCtx);
      const result = await cli.getStatus();
      if (!result.success) {
        throw new Error(result.error ?? "Failed to get network status");
      }
      const status = result.data as TailscaleCLIStatus;
      if (args.format === "summary") {
        return buildSummary(status);
      }
      return JSON.stringify(status, null, 2);
    },
  });

  defineTool(server, ctx, {
    name: "ping_peer",
    title: "Ping Peer",
    description:
      "Send Tailscale-layer ping packets to a peer device and return the results.",
    inputSchema: PingPeerInputSchema,
    annotations: { readOnlyHint: true },
    async handler(args, toolCtx) {
      const { cli } = getDeps(toolCtx);
      const result = await cli.ping(args.target, args.count);
      if (!result.success) {
        throw new Error(result.error ?? `Failed to ping ${args.target}`);
      }
      return `Ping results for ${args.target}:\n\n${result.data}`;
    },
  });

  defineTool(server, ctx, {
    name: "tailscale_up",
    title: "Tailscale Up",
    description:
      "Connect this device to the Tailscale network (runs `tailscale up`).",
    inputSchema: TailscaleUpInputSchema,
    annotations: { destructiveHint: false },
    async handler(args, toolCtx) {
      const { cli } = getDeps(toolCtx);
      const result = await cli.up({
        acceptRoutes: args.acceptRoutes,
        acceptDns: args.acceptDNS,
        hostname: args.hostname,
        advertiseRoutes: args.advertiseRoutes,
        authKey: args.authKey,
        loginServer: args.loginServer,
      });
      if (!result.success) {
        throw new Error(result.error ?? "Failed to connect to Tailscale");
      }
      return `Connected to Tailscale network.\n\n${result.data ?? ""}`.trimEnd();
    },
  });

  defineTool(server, ctx, {
    name: "tailscale_down",
    title: "Tailscale Down",
    description:
      "Disconnect this device from the Tailscale network (runs `tailscale down`).",
    inputSchema: z.object({}),
    annotations: { destructiveHint: true },
    async handler(_args, toolCtx) {
      const { cli } = getDeps(toolCtx);
      const result = await cli.down();
      if (!result.success) {
        throw new Error(result.error ?? "Failed to disconnect from Tailscale");
      }
      return `Disconnected from Tailscale network.\n\n${result.data ?? ""}`.trimEnd();
    },
  });

  defineTool(server, ctx, {
    name: "get_version",
    title: "Get Version",
    description: "Return the installed Tailscale CLI version string.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
    async handler(_args, toolCtx) {
      const { cli } = getDeps(toolCtx);
      const result = await cli.version();
      if (!result.success) {
        throw new Error(result.error ?? "Failed to get Tailscale version");
      }
      return `Tailscale version:\n\n${result.data}`;
    },
  });
}
