/**
 * Tool registration tests — verifies that all 15 expected tool names are
 * registered when registerTools() is called.
 *
 * Importers: none — new test file
 * Affected surface: new tests only
 * Data files: none
 * User instruction: "Execute all"
 */
import { describe, expect, test } from "bun:test";
import { registerAclTools } from "../../mcp/tools/acl.js";
import { registerAdminTools } from "../../mcp/tools/admin.js";
import { registerDeviceTools } from "../../mcp/tools/devices.js";
import { registerTools } from "../../mcp/tools/index.js";
import { registerNetworkTools } from "../../mcp/tools/network.js";
import {
  CapturingServer,
  makeConfig,
  makeFakeService,
  silentLogger,
} from "./helpers.js";

function makeContext(riskOverride?: "read" | "write" | "admin") {
  return {
    config: makeConfig(
      riskOverride ? { TAILSCALE_ALLOWED_TOOL_RISK: riskOverride } : {},
    ),
    logger: silentLogger,
    tailscale: makeFakeService(),
  };
}

const DEVICE_TOOL_NAMES = ["list_devices", "device_action", "manage_routes"];

const NETWORK_TOOL_NAMES = [
  "get_network_status",
  "connect_network",
  "disconnect_network",
  "ping_peer",
  "get_version",
];

const ADMIN_TOOL_NAMES = [
  "get_tailnet_info",
  "manage_file_sharing",
  "manage_exit_nodes",
  "manage_webhooks",
  "manage_device_tags",
  "get_version_info",
];

const ACL_TOOL_NAMES = [
  "manage_acl",
  "manage_dns",
  "manage_keys",
  "manage_policy_file",
  "manage_network_lock",
];

const ALL_TOOL_NAMES = [
  ...DEVICE_TOOL_NAMES,
  ...NETWORK_TOOL_NAMES,
  ...ADMIN_TOOL_NAMES,
  ...ACL_TOOL_NAMES,
];

describe("Tool registration", () => {
  test("registerDeviceTools registers expected tool names", () => {
    const server = new CapturingServer();
    registerDeviceTools(server as never, makeContext());
    expect(server.toolNames).toEqual(DEVICE_TOOL_NAMES);
  });

  test("registerNetworkTools registers expected tool names", () => {
    const server = new CapturingServer();
    registerNetworkTools(server as never, makeContext());
    expect(server.toolNames).toEqual(NETWORK_TOOL_NAMES);
  });

  test("registerAdminTools registers expected tool names", () => {
    const server = new CapturingServer();
    registerAdminTools(server as never, makeContext());
    expect(server.toolNames).toEqual(ADMIN_TOOL_NAMES);
  });

  test("registerAclTools registers expected tool names", () => {
    const server = new CapturingServer();
    registerAclTools(server as never, makeContext());
    expect(server.toolNames).toEqual(ACL_TOOL_NAMES);
  });

  test("registerTools registers all 15 tools", () => {
    const server = new CapturingServer();
    registerTools(server as never, makeContext());
    expect(server.toolNames).toHaveLength(ALL_TOOL_NAMES.length);
    for (const name of ALL_TOOL_NAMES) {
      expect(server.toolNames).toContain(name);
    }
  });
});
