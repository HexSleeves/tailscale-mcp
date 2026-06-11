/**
 * Risk-gating tests — verifies that tools with write/admin risk return an
 * error result when TAILSCALE_ALLOWED_TOOL_RISK is set to "read", and that
 * read-only tools are allowed through at all risk levels.
 *
 * Importers: none — new test file
 * Affected surface: new tests only
 * Data files: none
 * User instruction: "Execute all"
 */
import { describe, expect, test } from "bun:test";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { registerAclTools } from "../../mcp/tools/acl.js";
import { registerAdminTools } from "../../mcp/tools/admin.js";
import { registerDeviceTools } from "../../mcp/tools/devices.js";
import { registerNetworkTools } from "../../mcp/tools/network.js";
import {
  CapturingServer,
  makeConfig,
  makeFakeService,
  silentLogger,
} from "./helpers.js";

function buildServer(risk: "read" | "write" | "admin") {
  const server = new CapturingServer();
  const context = {
    config: makeConfig({ TAILSCALE_ALLOWED_TOOL_RISK: risk }),
    logger: silentLogger,
    tailscale: makeFakeService(),
  };
  registerDeviceTools(server as never, context);
  registerNetworkTools(server as never, context);
  registerAclTools(server as never, context);
  registerAdminTools(server as never, context);
  return server;
}

function isErrorResult(
  result: unknown,
): result is CallToolResult & { isError: true } {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as CallToolResult).isError === true
  );
}

describe("Risk gating — read config", () => {
  test("write tool (manage_routes) is blocked", async () => {
    const server = buildServer("read");
    const result = await server.callTool("manage_routes", {
      deviceId: "device-1",
      routes: ["10.0.0.0/8"],
      action: "enable",
    });
    expect(isErrorResult(result)).toBe(true);
    const content = (result as CallToolResult).content as Array<{
      text: string;
    }>;
    expect(content[0].text).toContain("write risk level");
  });

  test("admin tool (connect_network) is blocked", async () => {
    const server = buildServer("read");
    const result = await server.callTool("connect_network", {
      acceptRoutes: false,
      acceptDNS: false,
    });
    expect(isErrorResult(result)).toBe(true);
    const content = (result as CallToolResult).content as Array<{
      text: string;
    }>;
    expect(content[0].text).toContain("admin risk level");
  });

  test("admin tool (disconnect_network) is blocked", async () => {
    const server = buildServer("read");
    const result = await server.callTool("disconnect_network", {});
    expect(isErrorResult(result)).toBe(true);
  });

  test("admin tool (manage_keys create) is blocked", async () => {
    const server = buildServer("read");
    const result = await server.callTool("manage_keys", {
      operation: "create",
      keyConfig: {},
    });
    expect(isErrorResult(result)).toBe(true);
  });

  test("read tool (list_devices) is allowed at read risk", async () => {
    const server = buildServer("read");
    const result = await server.callTool("list_devices", {
      includeRoutes: false,
      includeOffline: true,
    });
    expect(isErrorResult(result)).toBe(false);
  });

  test("read tool (get_network_status) is allowed at read risk", async () => {
    const server = buildServer("read");
    const result = await server.callTool("get_network_status", {
      format: "json",
    });
    expect(isErrorResult(result)).toBe(false);
  });

  test("read tool (ping_peer) is allowed at read risk", async () => {
    const server = buildServer("read");
    const result = await server.callTool("ping_peer", {
      target: "100.64.0.2",
      count: 1,
    });
    expect(isErrorResult(result)).toBe(false);
  });

  test("read tool (get_tailnet_info) is allowed at read risk", async () => {
    const server = buildServer("read");
    const result = await server.callTool("get_tailnet_info", {
      includeDetails: false,
    });
    expect(isErrorResult(result)).toBe(false);
  });
});

describe("Risk gating — write config", () => {
  test("write tool (manage_routes) is allowed at write risk", async () => {
    const server = buildServer("write");
    const result = await server.callTool("manage_routes", {
      deviceId: "device-1",
      routes: ["10.0.0.0/8"],
      action: "enable",
    });
    expect(isErrorResult(result)).toBe(false);
  });

  test("admin tool (connect_network) is still blocked at write risk", async () => {
    const server = buildServer("write");
    const result = await server.callTool("connect_network", {
      acceptRoutes: false,
      acceptDNS: false,
    });
    expect(isErrorResult(result)).toBe(true);
    const content = (result as CallToolResult).content as Array<{
      text: string;
    }>;
    expect(content[0].text).toContain("admin risk level");
  });
});

describe("Risk gating — admin config", () => {
  test("admin tool (connect_network) is allowed at admin risk", async () => {
    const server = buildServer("admin");
    const result = await server.callTool("connect_network", {
      acceptRoutes: false,
      acceptDNS: false,
    });
    expect(isErrorResult(result)).toBe(false);
  });

  test("device_action delete is allowed at admin risk", async () => {
    const server = buildServer("admin");
    const result = await server.callTool("device_action", {
      deviceId: "device-1",
      action: "delete",
    });
    expect(isErrorResult(result)).toBe(false);
  });

  test("device_action authorize only needs write risk — allowed at admin", async () => {
    const server = buildServer("admin");
    const result = await server.callTool("device_action", {
      deviceId: "device-1",
      action: "authorize",
    });
    expect(isErrorResult(result)).toBe(false);
  });
});
