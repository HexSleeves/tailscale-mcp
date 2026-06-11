/**
 * Admin tool handler tests — success and error paths.
 *
 * Importers: none — new test file
 * Affected surface: new tests only
 * Data files: none
 * User instruction: "Execute all"
 */
import { describe, expect, test } from "bun:test";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { registerAdminTools } from "../../mcp/tools/admin.js";
import {
  CapturingServer,
  makeConfig,
  makeFakeService,
  sampleDevice,
  sampleSummary,
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
  registerAdminTools(server as never, context);
  return { server, svc };
}

describe("get_tailnet_info handler", () => {
  test("success path — returns tailnet summary", async () => {
    const { server, svc } = buildServer("read");
    svc.getTailnetSummary = async () => sampleSummary;

    const result = (await server.callTool("get_tailnet_info", {
      includeDetails: false,
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.tailnet.name).toBe("my-tailnet");
  });

  test("error path — service throws → isError result", async () => {
    const { server, svc } = buildServer("read");
    svc.getTailnetSummary = async () => {
      throw new Error("API error");
    };

    const result = (await server.callTool("get_tailnet_info", {
      includeDetails: false,
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("API error");
  });
});

describe("manage_file_sharing handler", () => {
  test("success path — get_status returns settings", async () => {
    const { server, svc } = buildServer("read");
    svc.api.getTailnetSettings = async () => ({
      success: true,
      data: { fileSharing: true },
    });

    const result = (await server.callTool("manage_file_sharing", {
      operation: "get_status",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.data.fileSharing).toBe(true);
  });

  test("success path — enable sets file sharing", async () => {
    const { server, svc } = buildServer("write");
    svc.api.setTailnetSettings = async () => ({
      success: true,
      data: undefined,
    });

    const result = (await server.callTool("manage_file_sharing", {
      operation: "enable",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
  });

  test("error path — API returns failure → isError result", async () => {
    const { server, svc } = buildServer("write");
    svc.api.setTailnetSettings = async () => ({
      success: false,
      error: "permission denied",
    });

    const result = (await server.callTool("manage_file_sharing", {
      operation: "enable",
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("permission denied");
  });
});

describe("manage_exit_nodes handler", () => {
  test("success path — list returns exit-node devices", async () => {
    const { server, svc } = buildServer("read");
    const exitNode = {
      ...sampleDevice,
      advertisedRoutes: ["0.0.0.0/0", "::/0"],
    };
    svc.listDevices = async () => [sampleDevice, exitNode];

    const result = (await server.callTool("manage_exit_nodes", {
      operation: "list",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    // Only the exit node should be in the filtered list.
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].advertisedRoutes).toContain("0.0.0.0/0");
  });

  test("success path — clear sets exit node via CLI", async () => {
    const { server, svc } = buildServer("admin");
    svc.cli.setExitNode = async () => ({ success: true, data: "cleared" });

    const result = (await server.callTool("manage_exit_nodes", {
      operation: "clear",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
  });

  test("error path — CLI returns failure → isError result", async () => {
    const { server, svc } = buildServer("admin");
    svc.cli.setExitNode = async () => ({ success: false, error: "CLI failed" });

    const result = (await server.callTool("manage_exit_nodes", {
      operation: "clear",
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("CLI failed");
  });
});

describe("manage_webhooks handler", () => {
  test("success path — list returns webhooks", async () => {
    const { server, svc } = buildServer("read");
    svc.api.listWebhooks = async () => ({
      success: true,
      data: [{ id: "wh-1" }],
    });

    const result = (await server.callTool("manage_webhooks", {
      operation: "list",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed.data)).toBe(true);
  });

  test("error path — API returns failure → isError result", async () => {
    const { server, svc } = buildServer("write");
    svc.api.createWebhook = async () => ({
      success: false,
      error: "invalid endpoint",
    });

    const result = (await server.callTool("manage_webhooks", {
      operation: "create",
      config: { endpointUrl: "https://example.com" },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
  });
});

describe("manage_device_tags handler", () => {
  test("success path — get_tags returns tags", async () => {
    const { server, svc } = buildServer("read");
    svc.getDevice = async () => ({ ...sampleDevice, tags: ["tag:prod"] });

    const result = (await server.callTool("manage_device_tags", {
      operation: "get_tags",
      deviceId: "device-1",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.data.tags).toContain("tag:prod");
  });

  test("success path — set_tags updates to provided tags", async () => {
    const { server, svc } = buildServer("write");
    svc.getDevice = async () => ({ ...sampleDevice, tags: ["tag:old"] });
    svc.api.setDeviceTags = async () => ({ success: true, data: undefined });

    const result = (await server.callTool("manage_device_tags", {
      operation: "set_tags",
      deviceId: "device-1",
      tags: ["tag:new"],
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.data.tags).toEqual(["tag:new"]);
  });

  test("error path — getDevice throws → isError result", async () => {
    const { server, svc } = buildServer("read");
    svc.getDevice = async () => {
      throw new Error("device not found");
    };

    const result = (await server.callTool("manage_device_tags", {
      operation: "get_tags",
      deviceId: "no-such",
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("device not found");
  });
});

describe("get_version_info handler", () => {
  test("success path — returns server name", async () => {
    const { server } = buildServer("read");

    const result = (await server.callTool(
      "get_version_info",
      {},
    )) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("tailscale-mcp-server");
  });
});
