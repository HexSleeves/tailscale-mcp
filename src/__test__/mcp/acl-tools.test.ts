/**
 * ACL tool handler tests — success and error paths.
 *
 * Importers: none — new test file
 * Affected surface: new tests only
 * Data files: none
 * User instruction: "Execute all"
 */
import { describe, expect, test } from "bun:test";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { registerAclTools } from "../../mcp/tools/acl.js";
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
  registerAclTools(server as never, context);
  return { server, svc };
}

describe("manage_acl handler", () => {
  test("success path — get returns ACL data", async () => {
    const { server, svc } = buildServer("read");
    svc.api.getACL = async () => ({
      success: true,
      data: '{"acls":[{"action":"accept"}]}',
    });

    const result = (await server.callTool("manage_acl", {
      operation: "get",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.data).toBeDefined();
  });

  test("success path — update returns confirmation", async () => {
    const { server, svc } = buildServer("write");
    svc.api.updateACL = async () => ({ success: true, data: undefined });

    const result = (await server.callTool("manage_acl", {
      operation: "update",
      aclConfig: { acls: [] },
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.data.message).toBe("ACL updated");
  });

  test("success path — validate returns validation result", async () => {
    const { server, svc } = buildServer("write");
    svc.api.validateACL = async () => ({
      success: true,
      data: { message: "ACL is valid" },
    });

    const result = (await server.callTool("manage_acl", {
      operation: "validate",
      aclConfig: { acls: [] },
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
  });

  test("error path — API returns failure → isError result", async () => {
    const { server, svc } = buildServer("read");
    svc.api.getACL = async () => ({
      success: false,
      error: "forbidden",
    });

    const result = (await server.callTool("manage_acl", {
      operation: "get",
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("forbidden");
  });
});

describe("manage_dns handler", () => {
  test("success path — get_nameservers returns nameservers", async () => {
    const { server, svc } = buildServer("read");
    svc.api.getDNSNameservers = async () => ({
      success: true,
      data: { dns: ["1.1.1.1", "8.8.8.8"] },
    });

    const result = (await server.callTool("manage_dns", {
      operation: "get_nameservers",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.data).toBeDefined();
  });

  test("success path — get_preferences returns MagicDNS status", async () => {
    const { server, svc } = buildServer("read");
    svc.api.getDNSPreferences = async () => ({
      success: true,
      data: { magicDNS: true },
    });

    const result = (await server.callTool("manage_dns", {
      operation: "get_preferences",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
  });

  test("success path — set_nameservers writes new nameservers", async () => {
    const { server, svc } = buildServer("write");
    svc.api.setDNSNameservers = async () => ({
      success: true,
      data: undefined,
    });

    const result = (await server.callTool("manage_dns", {
      operation: "set_nameservers",
      nameservers: ["1.1.1.1"],
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
  });

  test("error path — API returns failure → isError result", async () => {
    const { server, svc } = buildServer("read");
    svc.api.getDNSNameservers = async () => ({
      success: false,
      error: "DNS query failed",
    });

    const result = (await server.callTool("manage_dns", {
      operation: "get_nameservers",
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("DNS query failed");
  });
});

describe("manage_keys handler", () => {
  test("success path — list returns auth keys", async () => {
    const { server, svc } = buildServer("read");
    svc.api.listAuthKeys = async () => ({
      success: true,
      data: [{ id: "key-1", expires: "2025-01-01" }],
    });

    const result = (await server.callTool("manage_keys", {
      operation: "list",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed.data)).toBe(true);
  });

  test("success path — create returns new key", async () => {
    const { server, svc } = buildServer("admin");
    svc.api.createAuthKey = async () => ({
      success: true,
      data: { id: "key-new", key: "tskey-abc" },
    });

    const result = (await server.callTool("manage_keys", {
      operation: "create",
      keyConfig: { ephemeral: true },
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.data.id).toBe("key-new");
  });

  test("success path — delete returns confirmation", async () => {
    const { server, svc } = buildServer("admin");
    svc.api.deleteAuthKey = async () => ({ success: true, data: undefined });

    const result = (await server.callTool("manage_keys", {
      operation: "delete",
      keyId: "key-1",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.data.message).toContain("key-1");
  });

  test("error path — API returns failure → isError result", async () => {
    const { server, svc } = buildServer("admin");
    svc.api.createAuthKey = async () => ({
      success: false,
      error: "quota exceeded",
    });

    const result = (await server.callTool("manage_keys", {
      operation: "create",
      keyConfig: {},
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("quota exceeded");
  });
});

describe("manage_policy_file handler", () => {
  test("success path — get returns policy", async () => {
    const { server, svc } = buildServer("read");
    svc.api.getACL = async () => ({
      success: true,
      data: '{"groups":{}}',
    });

    const result = (await server.callTool("manage_policy_file", {
      operation: "get",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.data).toBeDefined();
  });

  test("success path — update returns confirmation", async () => {
    const { server, svc } = buildServer("write");
    svc.api.updateACL = async () => ({ success: true, data: undefined });

    const result = (await server.callTool("manage_policy_file", {
      operation: "update",
      policy: '{"acls":[]}',
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.data.message).toBe("Policy updated");
  });

  test("error path — update without policy throws → isError result", async () => {
    const { server } = buildServer("write");

    const result = (await server.callTool("manage_policy_file", {
      operation: "update",
      // policy intentionally omitted
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("policy is required");
  });

  test("error path — API failure → isError result", async () => {
    const { server, svc } = buildServer("read");
    svc.api.getACL = async () => ({
      success: false,
      error: "network error",
    });

    const result = (await server.callTool("manage_policy_file", {
      operation: "get",
    })) as CallToolResult;

    expect(result.isError).toBe(true);
  });
});

describe("manage_network_lock handler", () => {
  test("success path — status returns message", async () => {
    const { server } = buildServer("read");

    const result = (await server.callTool("manage_network_lock", {
      operation: "status",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toBeDefined();
  });

  test("admin-gated operation blocked at read risk", async () => {
    const { server } = buildServer("read");

    const result = (await server.callTool("manage_network_lock", {
      operation: "enable",
    })) as CallToolResult;

    expect(result.isError).toBe(true);
  });

  test("admin-gated operation allowed at admin risk", async () => {
    const { server } = buildServer("admin");

    const result = (await server.callTool("manage_network_lock", {
      operation: "enable",
    })) as CallToolResult;

    expect(result.isError).toBeUndefined();
  });
});
