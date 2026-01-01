import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { TailscaleCLIStatus } from "@/types.js";
import { logger } from "../logger.js";
import { returnToolError, returnToolSuccess } from "../utils.js";
import type { ToolContext, ToolModule } from "./index.js";

// Schemas
const NetworkStatusSchema = z.object({
  format: z
    .enum(["json", "summary"])
    .optional()
    .default("json")
    .describe("Output format (json or summary)"),
});

const ConnectNetworkSchema = z.object({
  acceptRoutes: z
    .boolean()
    .optional()
    .default(false)
    .describe("Accept subnet routes from other devices"),
  acceptDNS: z
    .boolean()
    .optional()
    .default(false)
    .describe("Accept DNS configuration from the network"),
  hostname: z
    .string()
    .optional()
    .describe("Set a custom hostname for this device"),
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

const PingPeerSchema = z.object({
  target: z.string().describe("Hostname or IP address of the target device"),
  count: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(4)
    .describe("Number of ping packets to send"),
});

// Tool handlers
async function getNetworkStatus(
  args: z.infer<typeof NetworkStatusSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Getting network status with format:", args.format);

    // Use unified client which will automatically choose between API and CLI
    const result = await context.client.getStatus();

    if (!result.success) {
      return returnToolError(result.error);
    }

    const status = result.data as TailscaleCLIStatus;

    if (args.format === "summary") {
      let output = "**Tailscale Network Status**\n\n";
      output += `Version: ${status.Version}\n`;
      output += `Backend state: ${status.BackendState}\n`;
      output += `TUN interface: ${status.TUN ? "Active" : "Inactive"}\n`;
      output += `Tailscale IPs: ${(status.TailscaleIPs ?? []).join(", ")}\n\n`;

      output += "**This device:**\n";
      output += `  - Hostname: ${status.Self.HostName}\n`;
      output += `  - DNS name: ${status.Self.DNSName}\n`;
      output += `  - OS: ${status.Self.OS}\n`;
      output += `  - IPs: ${status.Self.TailscaleIPs.join(", ")}\n`;
      output += `  - Online: ${status.Self.Online ? "🟢" : "🔴"}\n`;
      if (status.Self.ExitNode) {
        output += "  - Exit node: Yes\n";
      }
      output += "\n";

      if (status.Peer && Object.keys(status.Peer).length > 0) {
        const peers = Object.values(status.Peer);
        output += `**Connected peers (${peers.length}):**\n`;
        for (const peer of peers) {
          const onlineStatus = peer.Online ? "🟢" : "🔴";
          output += `  ${onlineStatus} ${peer.HostName} (${peer.DNSName})\n`;
          output += `    - OS: ${peer.OS}\n`;
          output += `    - IPs: ${peer.TailscaleIPs.join(", ")}\n`;
          if (peer.LastSeen && peer.LastSeen !== "0001-01-01T00:00:00Z") {
            output += `    - Last seen: ${peer.LastSeen}\n`;
          }
          if (peer.ExitNode) {
            output += "    - Exit node: Yes\n";
          }
          if (peer.Active) {
            output += "    - Active connection\n";
          }
        }
      }

      return returnToolSuccess(output);
    }
    // JSON format
    return returnToolSuccess(JSON.stringify(status, null, 2));
  } catch (error: unknown) {
    logger.error("Error getting network status:", error);
    const err =
      error instanceof Error
        ? error
        : new Error(String(error ?? "Unknown error"));
    return returnToolError(err);
  }
}

async function connectNetwork(
  args: z.infer<typeof ConnectNetworkSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    const options = {
      acceptRoutes: args.acceptRoutes || false,
      acceptDns: args.acceptDNS ?? false, // Note: CLI uses acceptDns, not acceptDNS
      hostname: args.hostname,
      advertiseRoutes: args.advertiseRoutes || [],
      authKey: args.authKey,
      loginServer: args.loginServer,
    };

    logger.debug("Connecting to Tailscale network with options:", options);

    // Use unified client - this operation is CLI-only
    const result = await context.client.connect(options);

    if (!result.success) {
      return returnToolError(result.error);
    }

    return returnToolSuccess(
      `Successfully connected to Tailscale network\n\n${result.data}`,
    );
  } catch (error: unknown) {
    logger.error("Error connecting to network:", error);
    return returnToolError(error);
  }
}

async function disconnectNetwork(
  _args: Record<string, unknown>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Disconnecting from Tailscale network");

    // Use unified client - this operation is CLI-only
    const result = await context.client.disconnect();

    if (!result.success) {
      return returnToolError(result.error);
    }

    return returnToolSuccess(
      `Successfully disconnected from Tailscale network\n\n${result.data}`,
    );
  } catch (error: unknown) {
    logger.error("Error disconnecting from network:", error);
    return returnToolError(error);
  }
}

async function pingPeer(
  args: z.infer<typeof PingPeerSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug(`Pinging ${args.target} (${args.count} packets)`);

    // Use unified client - this operation is CLI-only
    const result = await context.client.ping(args.target, args.count);

    if (!result.success) {
      return returnToolError(result.error);
    }

    return returnToolSuccess(
      `Ping results for ${args.target}:\n\n${result.data}`,
    );
  } catch (error: unknown) {
    logger.error("Error pinging peer:", error);
    return returnToolError(error);
  }
}

async function getVersion(
  _args: Record<string, unknown>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Getting Tailscale version");

    // Use unified client - this operation is CLI-only
    const result = await context.client.getVersion();

    if (!result.success) {
      return returnToolError(result.error);
    }

    return returnToolSuccess(
      `Tailscale version information:\n\n${result.data}`,
    );
  } catch (error: unknown) {
    logger.error("Error getting version:", error);
    return returnToolError(error);
  }
}

// Export the tool module
export const networkTools: ToolModule = {
  tools: [
    {
      name: "get_network_status",
      description: "Get current network status from Tailscale CLI",
      inputSchema: NetworkStatusSchema,
      handler: getNetworkStatus,
    },
    {
      name: "connect_network",
      description: "Connect to the Tailscale network",
      inputSchema: ConnectNetworkSchema,
      handler: connectNetwork,
    },
    {
      name: "disconnect_network",
      description: "Disconnect from the Tailscale network",
      inputSchema: z.object({}),
      handler: disconnectNetwork,
    },
    {
      name: "ping_peer",
      description: "Ping a peer device",
      inputSchema: PingPeerSchema,
      handler: pingPeer,
    },
    {
      name: "get_version",
      description: "Get Tailscale version information",
      inputSchema: z.object({}),
      handler: getVersion,
    },
  ],
};
