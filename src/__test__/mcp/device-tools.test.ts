/**
 * Device tool handler tests — success and error paths.
 *
 * Importers: none — new test file
 * Affected surface: new tests only
 * Data files: none
 * User instruction: "Execute all"
 */
import { describe, expect, test } from "bun:test";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { DevicesOutputSchema } from "../../mcp/schemas/tool-results.js";
import { registerDeviceTools } from "../../mcp/tools/devices.js";
import {
  CapturingServer,
  makeConfig,
  makeFakeService,
  sampleDevice,
  silentLogger,
} from "./helpers.js";

function buildServer(risk: "read" | "write" | "admin" = "admin") {
  const svc = makeFakeService();
  const server = new CapturingServer();
  const context = {
    config: makeConfig({ TAILSCALE_ALLOWED_TOOL_RISK: risk }),
    logger: silentLogger,
    tailscale: svc,
  };
  registerDeviceTools(server as never, context);
  return { server, svc };
}

describe("list_devices handler", () => {
  test("route fields are optional in the output JSON Schema", () => {
    const schema = z.toJSONSchema(DevicesOutputSchema) as unknown as {
      properties: {
        devices: { items: { required?: string[] } };
      };
    };
    const required = schema.properties.devices.items.required ?? [];

    expect(required).not.toContain("advertisedRoutes");
    expect(required).not.toContain("enabledRoutes");
  });

  test("success path — returns device list content", async () => {
    const { server, svc } = buildServer("read");
    svc.listDevices = async () => [sampleDevice];

    const result = (await server.callTool("list_devices", {
      includeRoutes: false,
      includeOffline: true,
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.devices).toHaveLength(1);
    expect(parsed.devices[0].id).toBe("device-1");
  });

  test("success path — includeRoutes=false strips route fields", async () => {
    const { server, svc } = buildServer("read");
    svc.listDevices = async () => [
      {
        ...sampleDevice,
        advertisedRoutes: ["10.0.0.0/8"],
        enabledRoutes: ["10.0.0.0/8"],
      },
    ];

    const result = (await server.callTool("list_devices", {
      includeRoutes: false,
      includeOffline: true,
    })) as CallToolResult;

    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.devices[0].advertisedRoutes).toBeUndefined();
    expect(parsed.devices[0].enabledRoutes).toBeUndefined();
  });

  test("success path — includeRoutes=true keeps route fields", async () => {
    const { server, svc } = buildServer("read");
    svc.listDevices = async () => [
      {
        ...sampleDevice,
        advertisedRoutes: ["10.0.0.0/8"],
        enabledRoutes: ["10.0.0.0/8"],
      },
    ];

    const result = (await server.callTool("list_devices", {
      includeRoutes: true,
      includeOffline: true,
    })) as CallToolResult;

    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.devices[0].advertisedRoutes).toEqual(["10.0.0.0/8"]);
  });

  test("error path — service throws → isError result", async () => {
    const { server, svc } = buildServer("read");
    svc.listDevices = async () => {
      throw new Error("API unavailable");
    };

    const result = (await server.callTool("list_devices", {
      includeRoutes: false,
      includeOffline: true,
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("API unavailable");
  });
});

describe("device_action handler", () => {
  test("success path — authorize action returns message", async () => {
    const { server, svc } = buildServer("write");
    svc.deviceAction = async (id, action) =>
      `Successfully performed ${action} on ${id}`;

    const result = (await server.callTool("device_action", {
      deviceId: "device-1",
      action: "authorize",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("authorize");
  });

  test("success path — expire-key action is write-level allowed", async () => {
    const { server, svc } = buildServer("write");
    svc.deviceAction = async (_id, action) => `performed ${action}`;

    const result = (await server.callTool("device_action", {
      deviceId: "device-1",
      action: "expire-key",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
  });

  test("error path — service throws → isError result", async () => {
    const { server, svc } = buildServer("admin");
    svc.deviceAction = async () => {
      throw new Error("Device not found");
    };

    const result = (await server.callTool("device_action", {
      deviceId: "no-such-device",
      action: "delete",
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("Device not found");
  });
});

describe("manage_routes handler", () => {
  test("success path — enable routes returns message", async () => {
    const { server, svc } = buildServer("write");
    svc.manageRoutes = async (id) => `Enabled routes for ${id}`;

    const result = (await server.callTool("manage_routes", {
      deviceId: "device-1",
      routes: ["10.0.0.0/8"],
      action: "enable",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("Enabled routes for device-1");
  });

  test("error path — service throws → isError result", async () => {
    const { server, svc } = buildServer("write");
    svc.manageRoutes = async () => {
      throw new Error("Route update failed");
    };

    const result = (await server.callTool("manage_routes", {
      deviceId: "device-1",
      routes: ["10.0.0.0/8"],
      action: "enable",
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("Route update failed");
  });
});
