import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../logger.js";
import type { UnifiedResponse } from "../tailscale/unified-client.js";
import { returnToolError, returnToolSuccess } from "../utils.js";
import type { ToolContext, ToolModule } from "./index.js";

// Schemas
const ListDevicesSchema = z.object({
  includeRoutes: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include route information for each device"),
});

const DeviceActionSchema = z.object({
  deviceId: z.string().describe("The ID of the device to act on"),
  action: z
    .enum(["authorize", "deauthorize", "delete", "expire-key"])
    .describe("The action to perform on the device"),
});

const ManageRoutesSchema = z.object({
  deviceId: z.string().describe("The ID of the device"),
  routes: z.array(z.string()).describe("Array of CIDR routes to manage"),
  action: z
    .enum(["enable", "disable"])
    .describe("Whether to enable or disable the routes"),
});

// Tool handlers
async function listDevices(
  args: z.infer<typeof ListDevicesSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Listing devices with options:", args);

    // Use unified client which will automatically choose between API and CLI
    const result = await context.client.listDevices();

    if (!result.success) {
      return returnToolError(result);
    }

    const devices = result.data || [];
    let output = `Found ${devices.length} devices:\n\n`;

    for (const device of devices) {
      // Handle both string arrays (from CLI) and TailscaleDevice objects (from API)
      if (typeof device === "string") {
        // CLI returns simple string array of hostnames
        output += `**${device}**\n`;
        output += "  - Source: CLI (limited info available)\n\n";
      } else {
        // API returns full TailscaleDevice objects
        const typedDevice = device;
        output += `**${typedDevice.name}** (${typedDevice.hostname})\n`;
        output += `  - ID: ${typedDevice.id}\n`;
        output += `  - OS: ${typedDevice.os}\n`;
        output += `  - Addresses: ${typedDevice.addresses.join(", ")}\n`;
        output += `  - Authorized: ${typedDevice.authorized ? "✅" : "❌"}\n`;
        output += `  - Last seen: ${typedDevice.lastSeen}\n`;
        output += `  - Client version: ${typedDevice.clientVersion}\n`;

        if (
          args.includeRoutes &&
          Array.isArray(typedDevice.advertisedRoutes) &&
          typedDevice.advertisedRoutes.length > 0
        ) {
          output += `  - Advertised routes: ${typedDevice.advertisedRoutes.join(
            ", ",
          )}\n`;
          output += `  - Enabled routes: ${
            Array.isArray(typedDevice.enabledRoutes)
              ? typedDevice.enabledRoutes.join(", ")
              : "—"
          }\n`;
        }

        output += "\n";
      }
    }

    return returnToolSuccess(output);
  } catch (error: unknown) {
    logger.error("Error listing devices:", error);
    return returnToolError(error);
  }
}

async function deviceAction(
  args: z.infer<typeof DeviceActionSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Performing device action:", args);

    let result: UnifiedResponse<void>;
    switch (args.action) {
      case "authorize":
        result = await context.client.authorizeDevice(args.deviceId);
        break;
      case "deauthorize":
        result = await context.client.deauthorizeDevice(args.deviceId);
        break;
      case "delete":
        result = await context.client.deleteDevice(args.deviceId);
        break;
      case "expire-key":
        result = await context.client.expireDeviceKey(args.deviceId);
        break;
      default:
        return returnToolError(`Unknown action: ${args.action}`);
    }

    if (!result.success) {
      return returnToolError(result.error);
    }

    return returnToolSuccess(
      `Successfully performed action "${args.action}" on device ${args.deviceId}`,
    );
  } catch (error: unknown) {
    logger.error("Error performing device action:", error);
    return returnToolError(error);
  }
}

async function manageRoutes(
  args: z.infer<typeof ManageRoutesSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Managing routes:", args);

    let result: UnifiedResponse<void>;
    if (args.action === "enable") {
      result = await context.client.enableDeviceRoutes(
        args.deviceId,
        args.routes,
      );
    } else {
      result = await context.client.disableDeviceRoutes(
        args.deviceId,
        args.routes,
      );
    }

    if (!result.success) {
      return returnToolError(result.error);
    }

    const verbPast = args.action === "enable" ? "enabled" : "disabled";
    return returnToolSuccess(
      `Successfully ${verbPast} routes ${args.routes.join(
        ", ",
      )} for device ${args.deviceId}`,
    );
  } catch (error: unknown) {
    logger.error("Error managing routes:", error);
    return returnToolError(error);
  }
}

// Export the tool module
export const deviceTools: ToolModule = {
  tools: [
    {
      name: "list_devices",
      description: "List all devices in the Tailscale network",
      inputSchema: ListDevicesSchema,
      handler: listDevices,
    },
    {
      name: "device_action",
      description: "Perform actions on a specific device",
      inputSchema: DeviceActionSchema,
      handler: deviceAction,
    },
    {
      name: "manage_routes",
      description: "Enable or disable routes for a device",
      inputSchema: ManageRoutesSchema,
      handler: manageRoutes,
    },
  ],
};
