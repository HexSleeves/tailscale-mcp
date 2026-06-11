/**
 * Network tool handler tests — success and error paths.
 *
 * Importers: none — new test file
 * Affected surface: new tests only
 * Data files: none
 * User instruction: "Execute all"
 */
import { describe, expect, test } from "bun:test";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { registerNetworkTools } from "../../mcp/tools/network.js";
import {
  CapturingServer,
  makeConfig,
  makeFakeService,
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
  registerNetworkTools(server as never, context);
  return { server, svc };
}

describe("get_network_status handler", () => {
  test("success path — returns status content", async () => {
    const { server, svc } = buildServer("read");
    svc.getNetworkStatus = async () => ({ Self: { ID: "node-1" }, Peer: {} });

    const result = (await server.callTool("get_network_status", {
      format: "json",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.status).toBeDefined();
  });

  test("error path — service throws → isError result", async () => {
    const { server, svc } = buildServer("read");
    svc.getNetworkStatus = async () => {
      throw new Error("daemon unavailable");
    };

    const result = (await server.callTool("get_network_status", {
      format: "json",
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("daemon unavailable");
  });
});

describe("connect_network handler", () => {
  test("success path — returns connected message", async () => {
    const { server, svc } = buildServer("admin");
    svc.connect = async () => "Connected successfully";

    const result = (await server.callTool("connect_network", {
      acceptRoutes: false,
      acceptDNS: false,
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("Connected");
  });

  test("error path — service throws → isError result", async () => {
    const { server, svc } = buildServer("admin");
    svc.connect = async () => {
      throw new Error("already connected");
    };

    const result = (await server.callTool("connect_network", {
      acceptRoutes: false,
      acceptDNS: false,
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("already connected");
  });
});

describe("disconnect_network handler", () => {
  test("success path — returns disconnected message", async () => {
    const { server, svc } = buildServer("admin");
    svc.disconnect = async () => "Disconnected";

    const result = (await server.callTool(
      "disconnect_network",
      {},
    )) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("Disconnected");
  });

  test("error path — service throws → isError result", async () => {
    const { server, svc } = buildServer("admin");
    svc.disconnect = async () => {
      throw new Error("not connected");
    };

    const result = (await server.callTool(
      "disconnect_network",
      {},
    )) as CallToolResult;

    expect(result.isError).toBe(true);
  });
});

describe("ping_peer handler", () => {
  test("success path — returns ping output", async () => {
    const { server, svc } = buildServer("read");
    svc.ping = async (target) => `pong from ${target}`;

    const result = (await server.callTool("ping_peer", {
      target: "100.64.0.2",
      count: 2,
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("pong");
  });

  test("error path — service throws → isError result", async () => {
    const { server, svc } = buildServer("read");
    svc.ping = async () => {
      throw new Error("host unreachable");
    };

    const result = (await server.callTool("ping_peer", {
      target: "100.64.0.2",
      count: 1,
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("host unreachable");
  });
});

describe("get_version handler", () => {
  test("success path — returns version string", async () => {
    const { server, svc } = buildServer("read");
    svc.getVersion = async () => "1.50.1-t1234abcd";

    const result = (await server.callTool("get_version", {})) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("1.50.1");
  });

  test("success path — returns object version info if CLI unavailable", async () => {
    const { server, svc } = buildServer("read");
    svc.getVersion = async () => ({ version: "API v2", cliAvailable: false });

    const result = (await server.callTool("get_version", {})) as CallToolResult;

    expect(result.isError).toBeUndefined();
  });

  test("error path — service throws → isError result", async () => {
    const { server, svc } = buildServer("read");
    svc.getVersion = async () => {
      throw new Error("CLI not found");
    };

    const result = (await server.callTool("get_version", {})) as CallToolResult;

    expect(result.isError).toBe(true);
  });
});
