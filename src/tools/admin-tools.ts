import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../logger.js";
import { returnToolError, returnToolSuccess } from "../utils.js";
import type { ToolContext, ToolModule } from "./index.js";

// Schemas
const TailnetInfoSchema = z.object({
  includeDetails: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include advanced configuration details"),
});

const FileSharingSchema = z.object({
  operation: z
    .enum(["get_status", "enable", "disable"])
    .describe("File sharing operation to perform"),
  deviceId: z
    .string()
    .optional()
    .describe("Device ID (for device-specific operations)"),
});

const ExitNodeSchema = z.object({
  operation: z
    .enum(["list", "set", "clear", "advertise", "stop_advertising"])
    .describe("Exit node operation to perform"),
  deviceId: z
    .string()
    .optional()
    .describe("Device ID for exit node operations"),
  routes: z
    .array(z.string())
    .optional()
    .describe(
      'Routes to advertise (required for "advertise" operation, e.g., ["0.0.0.0/0", "::/0"] for full exit node)',
    ),
});

const WebhookSchema = z.object({
  operation: z
    .enum(["list", "create", "delete", "test"])
    .describe("Webhook operation to perform"),
  webhookId: z
    .string()
    .optional()
    .describe("Webhook ID for delete/test operations"),
  config: z
    .object({
      endpointUrl: z.string(),
      description: z.string().optional(),
      events: z.array(z.string()),
      secret: z.string().optional(),
    })
    .optional()
    .describe("Webhook configuration for create operation"),
});

const DeviceTaggingSchema = z.object({
  operation: z
    .enum(["get_tags", "set_tags", "add_tags", "remove_tags"])
    .describe("Device tagging operation to perform"),
  deviceId: z.string().describe("Device ID for tagging operations"),
  tags: z
    .array(z.string())
    .optional()
    .describe(
      'Array of tags to manage (e.g., ["tag:server", "tag:production"])',
    ),
});

const _SSHManagementSchema = z.object({
  operation: z
    .enum(["get_ssh_settings", "update_ssh_settings"])
    .describe("SSH management operation to perform"),
  sshSettings: z
    .object({
      enabled: z.boolean().optional(),
      checkPeriod: z.string().optional(),
    })
    .optional()
    .describe("SSH configuration settings for update operation"),
});

const _NetworkStatsSchema = z.object({
  operation: z
    .enum(["get_network_overview", "get_device_stats"])
    .describe("Statistics operation to perform"),
  deviceId: z
    .string()
    .optional()
    .describe("Device ID for device-specific statistics"),
  timeRange: z
    .enum(["1h", "24h", "7d", "30d"])
    .optional()
    .describe("Time range for statistics"),
});

const _UserManagementSchema = z.object({
  operation: z
    .enum(["list_users", "get_user", "update_user_role"])
    .describe("User management operation to perform"),
  userId: z
    .string()
    .optional()
    .describe("User ID for specific user operations"),
  role: z
    .enum(["admin", "user", "auditor"])
    .optional()
    .describe("User role for role update operations"),
});

const _DevicePostureSchema = z.object({
  operation: z
    .enum(["get_posture", "set_posture_policy", "check_compliance"])
    .describe("Device posture operation to perform"),
  deviceId: z.string().optional().describe("Device ID for posture operations"),
  policy: z
    .object({
      requiredSoftware: z.array(z.string()).optional(),
      allowedOSVersions: z.array(z.string()).optional(),
      requireUpdate: z.boolean().optional(),
    })
    .optional()
    .describe("Posture policy configuration"),
});

const _LoggingSchema = z.object({
  operation: z
    .enum(["get_log_config", "set_log_level", "get_audit_logs"])
    .describe("Logging operation to perform"),
  logLevel: z
    .enum(["debug", "info", "warn", "error"])
    .optional()
    .describe("Log level for set_log_level operation"),
  component: z
    .string()
    .optional()
    .describe("Specific component for targeted logging"),
});

// Tool handlers
async function getTailnetInfo(
  args: z.infer<typeof TailnetInfoSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Getting tailnet information:", args);

    const result = await context.api.getDetailedTailnetInfo();
    if (!result.success) {
      return returnToolError(result.error);
    }

    const info = result.data;
    const isKeyExpiryDisabled = info?.keyExpiryDisabled ? "Yes" : "No";
    const isDeviceApprovalRequired = info?.deviceApprovalRequired
      ? "Yes"
      : "No";

    const formattedInfo = `**Tailnet Information**

**Basic Details:**
  - Name: ${info?.name || "Unknown"}
  - Organization: ${info?.organization || "Unknown"}
  - Created: ${info?.created || "Unknown"}

**Settings:**
  - DNS: ${info?.dns ? "Configured" : "Not configured"}
  - File sharing: ${info?.fileSharing ? "Enabled" : "Disabled"}
  - Service collection: ${info?.serviceCollection ? "Enabled" : "Disabled"}

**Security:**
  - Network lock: ${info?.networkLockEnabled ? "Enabled" : "Disabled"}
  - OIDC identity provider: ${info?.oidcIdentityProviderURL || "Not configured"}

${
  args.includeDetails
    ? `
**Advanced Details:**
  - Key expiry disabled: ${isKeyExpiryDisabled}
  - Machine authorization timeout: ${
    info?.machineAuthorizationTimeout || "Default"
  }
  - Device approval required: ${isDeviceApprovalRequired}`
    : ""
}`;

    return returnToolSuccess(formattedInfo);
  } catch (error) {
    logger.error("Error getting tailnet info:", error);

    return returnToolError(error);
  }
}

async function manageFileSharing(
  args: z.infer<typeof FileSharingSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Managing file sharing:", args);

    switch (args.operation) {
      case "get_status": {
        const result = await context.api.getFileSharingStatus();
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `File Sharing Status: ${
            result.data?.fileSharing ? "Enabled" : "Disabled"
          }`,
        );
      }

      case "enable": {
        const result = await context.api.setFileSharingStatus(true);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess("File sharing enabled successfully");
      }

      case "disable": {
        const result = await context.api.setFileSharingStatus(false);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess("File sharing disabled successfully");
      }

      default:
        return returnToolError(
          "Invalid file sharing operation. Use: get_status, enable, or disable",
        );
    }
  } catch (error) {
    logger.error("Error managing file sharing:", error);
    return returnToolError(error);
  }
}

async function manageExitNodes(
  args: z.infer<typeof ExitNodeSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Managing exit nodes:", args);

    switch (args.operation) {
      case "list": {
        const devicesResult = await context.api.listDevices();
        if (!devicesResult.success) {
          return returnToolError(devicesResult.error);
        }

        const devices = devicesResult.data || [];
        const exitNodes = devices.filter(
          (device) =>
            device.advertisedRoutes?.includes("0.0.0.0/0") ||
            device.advertisedRoutes?.includes("::/0"),
        );

        if (exitNodes.length === 0) {
          return returnToolSuccess("No exit nodes found in the network");
        }

        const exitNodeList = exitNodes
          .map((node) => {
            return `**${node.name}** (${node.hostname})
  - ID: ${node.id}
  - OS: ${node.os}
  - Routes: ${node.advertisedRoutes?.join(", ") || "None"}
  - Status: ${node.authorized ? "Authorized" : "Unauthorized"}`;
          })
          .join("\n\n");

        return returnToolSuccess(
          `Exit Nodes (${exitNodes.length}):\n\n${exitNodeList}`,
        );
      }

      case "advertise": {
        if (!args.deviceId) {
          return returnToolError(
            "Device ID is required for advertise operation",
          );
        }
        if (!args.routes || args.routes.length === 0) {
          return returnToolError(
            "At least one route is required for advertise operation (e.g., ['0.0.0.0/0', '::/0'] for full exit node)",
          );
        }

        const result = await context.api.setDeviceExitNode(
          args.deviceId,
          args.routes,
        );
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Device ${
            args.deviceId
          } is now advertising routes: ${args.routes.join(", ")}`,
        );
      }

      case "set": {
        const nodeId = args.deviceId ?? "";
        const cliResult = await context.cli.setExitNode(nodeId);
        if (!cliResult.success) {
          return returnToolError(cliResult.error);
        }

        return returnToolSuccess(
          `Exit node set to: ${args.deviceId || "auto"}`,
        );
      }

      case "clear": {
        const cliResult = await context.cli.setExitNode();
        if (!cliResult.success) {
          return returnToolError(cliResult.error);
        }

        return returnToolSuccess("Exit node cleared successfully");
      }

      default:
        return returnToolError(
          "Invalid exit node operation. Use: list, set, clear, advertise",
        );
    }
  } catch (error) {
    logger.error("Error managing exit nodes:", error);
    return returnToolError(error);
  }
}

async function manageWebhooks(
  args: z.infer<typeof WebhookSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Managing webhooks:", args);

    switch (args.operation) {
      case "list": {
        const result = await context.api.listWebhooks();
        if (!result.success) {
          return returnToolError(result.error);
        }

        const webhooks = result.data?.webhooks || [];
        if (webhooks.length === 0) {
          return returnToolSuccess("No webhooks configured");
        }

        const webhookList = webhooks
          .map((webhook, index: number) => {
            return `**Webhook ${index + 1}**
  - ID: ${webhook.id}
  - URL: ${webhook.endpointUrl}
  - Events: ${webhook.events?.join(", ") || "None"}
  - Description: ${webhook.description || "No description"}
  - Created: ${webhook.createdAt}`;
          })
          .join("\n\n");

        return returnToolSuccess(
          `Found ${webhooks.length} webhooks:\n\n${webhookList}`,
        );
      }

      case "create": {
        if (!args.config) {
          return returnToolError(
            "Webhook configuration is required for create operation",
          );
        }

        const result = await context.api.createWebhook(args.config);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Webhook created successfully:
  - ID: ${result.data?.id}
  - URL: ${result.data?.endpointUrl}
  - Events: ${result.data?.events?.join(", ")}`,
        );
      }

      case "delete": {
        if (!args.webhookId) {
          return returnToolError("Webhook ID is required for delete operation");
        }

        const result = await context.api.deleteWebhook(args.webhookId);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Webhook ${args.webhookId} deleted successfully`,
        );
      }

      case "test": {
        if (!args.webhookId) {
          return returnToolError("Webhook ID is required for test operation");
        }

        const result = await context.api.testWebhook(args.webhookId);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Webhook test successful. Response: ${JSON.stringify(
            result.data,
            null,
            2,
          )}`,
        );
      }

      default:
        return returnToolError(
          "Invalid webhook operation. Use: list, create, delete, or test",
        );
    }
  } catch (error) {
    logger.error("Error managing webhooks:", error);
    return returnToolError(error);
  }
}

async function manageDeviceTags(
  args: z.infer<typeof DeviceTaggingSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Managing device tags:", args);

    switch (args.operation) {
      case "get_tags": {
        const result = await context.api.getDeviceTags(args.deviceId);
        if (!result.success) {
          return returnToolError(result.error);
        }

        const tags = result.data?.tags || [];
        return returnToolSuccess(
          `Device Tags for ${args.deviceId}:\n${
            tags.length > 0
              ? tags.map((tag) => `  - ${tag}`).join("\n")
              : "  No tags assigned"
          }`,
        );
      }

      case "set_tags": {
        if (!args.tags) {
          return returnToolError(
            "Tags array is required for set_tags operation",
          );
        }

        const result = await context.api.setDeviceTags(
          args.deviceId,
          args.tags,
        );
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Device tags updated to: ${args.tags.join(", ")}`,
        );
      }

      case "add_tags": {
        if (!args.tags) {
          return returnToolError(
            "Tags array is required for add_tags operation",
          );
        }

        // Get current tags first
        const currentResult = await context.api.getDeviceTags(args.deviceId);
        if (!currentResult.success) {
          return returnToolError(currentResult.error);
        }

        const currentTags = currentResult.data?.tags || [];
        const newTags = [...new Set([...currentTags, ...args.tags])];

        const result = await context.api.setDeviceTags(args.deviceId, newTags);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Added tags: ${args.tags.join(
            ", ",
          )}. Current tags: ${newTags.join(", ")}`,
        );
      }

      case "remove_tags": {
        if (!args.tags) {
          return returnToolError(
            "Tags array is required for remove_tags operation",
          );
        }

        // Get current tags first
        const currentResult = await context.api.getDeviceTags(args.deviceId);
        if (!currentResult.success) {
          return returnToolError(currentResult.error);
        }

        const currentTags = currentResult.data?.tags || [];
        const newTags = currentTags.filter((tag) => !args.tags?.includes(tag));

        const result = await context.api.setDeviceTags(args.deviceId, newTags);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Removed tags: ${args.tags.join(", ")}. Remaining tags: ${
            newTags.join(", ") || "None"
          }`,
        );
      }

      default:
        return returnToolError(
          "Invalid device tagging operation. Use: get_tags, set_tags, add_tags, or remove_tags",
        );
    }
  } catch (error) {
    logger.error("Error managing device tags:", error);
    return returnToolError(error);
  }
}

// Export the tool module
export const adminTools: ToolModule = {
  tools: [
    {
      name: "get_tailnet_info",
      description: "Get detailed Tailscale network information",
      inputSchema: TailnetInfoSchema,
      handler: getTailnetInfo,
    },
    {
      name: "manage_file_sharing",
      description: "Manage Tailscale file sharing settings",
      inputSchema: FileSharingSchema,
      handler: manageFileSharing,
    },
    {
      name: "manage_exit_nodes",
      description: "Manage Tailscale exit nodes and routing",
      inputSchema: ExitNodeSchema,
      handler: manageExitNodes,
    },
    {
      name: "manage_webhooks",
      description: "Manage Tailscale webhooks for event notifications",
      inputSchema: WebhookSchema,
      handler: manageWebhooks,
    },
    {
      name: "manage_device_tags",
      description: "Manage device tags for organization and ACL targeting",
      inputSchema: DeviceTaggingSchema,
      handler: manageDeviceTags,
    },
  ],
};
