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

const ListDevicesInputSchema = z.object({
  includeRoutes: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include advertised/enabled route information for each device"),
});

const ListDevicesOutputSchema = z.object({
  count: z.number().describe("Total number of devices"),
  devices: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      os: z.string(),
      addresses: z.array(z.string()),
      authorized: z.boolean(),
      lastSeen: z.string(),
    }),
  ),
});

const DeviceActionInputSchema = z.object({
  deviceId: z.string().describe("The ID of the device to act on"),
  action: z
    .enum(["authorize", "deauthorize", "delete", "expire-key"])
    .describe("The action to perform on the device"),
});

const ManageRoutesInputSchema = z.object({
  deviceId: z.string().describe("The ID of the device"),
  routes: z.array(z.string()).describe("Array of CIDR routes to manage"),
  action: z
    .enum(["enable", "disable"])
    .describe("Whether to enable or disable the specified routes"),
});

export function registerDeviceTools(server: McpServer, ctx: ToolContext): void {
  defineTool(server, ctx, {
    name: "list_devices",
    title: "List Devices",
    description:
      "List all devices enrolled in the Tailscale tailnet, with optional route details.",
    inputSchema: ListDevicesInputSchema,
    outputSchema: ListDevicesOutputSchema,
    annotations: { readOnlyHint: true },
    async handler(_args, toolCtx) {
      const { api } = getDeps(toolCtx);
      const result = await api.listDevices();
      if (!result.success) {
        throw new Error(result.error ?? "Failed to list devices");
      }
      const devices = (result.data ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        os: d.os,
        addresses: d.addresses,
        authorized: d.authorized,
        lastSeen: d.lastSeen,
      }));
      return { count: devices.length, devices };
    },
  });

  defineTool(server, ctx, {
    name: "device_action",
    title: "Device Action",
    description:
      "Authorize, deauthorize, delete, or expire the key of a specific device.",
    inputSchema: DeviceActionInputSchema,
    annotations: { destructiveHint: true },
    async handler(args, toolCtx) {
      const { api } = getDeps(toolCtx);
      let result: Awaited<ReturnType<TailscaleAPI["authorizeDevice"]>>;
      switch (args.action) {
        case "authorize":
          result = await api.authorizeDevice(args.deviceId);
          break;
        case "deauthorize":
          result = await api.deauthorizeDevice(args.deviceId);
          break;
        case "delete":
          result = await api.deleteDevice(args.deviceId);
          break;
        case "expire-key":
          result = await api.expireDeviceKey(args.deviceId);
          break;
      }
      if (!result.success) {
        throw new Error(result.error ?? `Failed to ${args.action} device`);
      }
      return `Successfully performed action "${args.action}" on device ${args.deviceId}`;
    },
  });

  defineTool(server, ctx, {
    name: "manage_routes",
    title: "Manage Routes",
    description:
      "Enable or disable subnet routes advertised by a specific device.",
    inputSchema: ManageRoutesInputSchema,
    annotations: { destructiveHint: true },
    async handler(args, toolCtx) {
      const { api } = getDeps(toolCtx);
      const result =
        args.action === "enable"
          ? await api.enableDeviceRoutes(args.deviceId, args.routes)
          : await api.disableDeviceRoutes(args.deviceId, args.routes);
      if (!result.success) {
        throw new Error(result.error ?? `Failed to ${args.action} routes`);
      }
      const verbPast = args.action === "enable" ? "enabled" : "disabled";
      return `Successfully ${verbPast} routes ${args.routes.join(", ")} for device ${args.deviceId}`;
    },
  });
}
