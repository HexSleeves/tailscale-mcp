/**
 * Resource handler tests — success and error paths for all four resources.
 *
 * Importers: none — new test file
 * Affected surface: new tests only
 * Data files: none
 * User instruction: "Execute all"
 */
import { describe, expect, test } from "bun:test";
import { registerResources } from "../../mcp/resources/index.js";
import {
  CapturingServer,
  makeConfig,
  makeFakeService,
  sampleDevice,
  sampleSummary,
  silentLogger,
} from "./helpers.js";

function buildServer() {
  const svc = makeFakeService();
  const server = new CapturingServer();
  const context = {
    config: makeConfig(),
    logger: silentLogger,
    tailscale: svc,
  };
  registerResources(server as never, context);
  return { server, svc };
}

describe("Resource registration", () => {
  test("registers tailnet-summary, devices, device, and acl-current", () => {
    const { server } = buildServer();
    expect(server.resourceNames).toContain("tailnet-summary");
    expect(server.resourceNames).toContain("devices");
    expect(server.resourceNames).toContain("device");
    expect(server.resourceNames).toContain("acl-current");
    expect(server.resourceNames).toHaveLength(4);
  });
});

describe("tailnet-summary resource", () => {
  test("success path — returns JSON content with tailnet data", async () => {
    const { server, svc } = buildServer();
    svc.getTailnetSummary = async () => sampleSummary;

    const result = (await server.callResource(
      "tailnet-summary",
      "tailscale://tailnet/summary",
    )) as { contents: Array<{ uri: string; mimeType: string; text: string }> };

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe("application/json");
    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed.name).toBe("my-tailnet");
  });

  test("error path — service throws → propagates error", async () => {
    const { server, svc } = buildServer();
    svc.getTailnetSummary = async () => {
      throw new Error("tailnet unavailable");
    };

    await expect(
      server.callResource("tailnet-summary", "tailscale://tailnet/summary"),
    ).rejects.toThrow("tailnet unavailable");
  });
});

describe("devices resource", () => {
  test("success path — returns JSON content with device list", async () => {
    const { server, svc } = buildServer();
    svc.listDevices = async () => [sampleDevice];

    const result = (await server.callResource(
      "devices",
      "tailscale://devices",
    )) as { contents: Array<{ uri: string; mimeType: string; text: string }> };

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe("application/json");
    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed.devices).toHaveLength(1);
    expect(parsed.devices[0].id).toBe("device-1");
  });

  test("error path — service throws → propagates error", async () => {
    const { server, svc } = buildServer();
    svc.listDevices = async () => {
      throw new Error("listing failed");
    };

    await expect(
      server.callResource("devices", "tailscale://devices"),
    ).rejects.toThrow("listing failed");
  });
});

describe("device template resource", () => {
  test("success path — returns single device content", async () => {
    const { server, svc } = buildServer();
    svc.getDevice = async (id) => ({ ...sampleDevice, id });

    const result = (await server.callResource(
      "device",
      "tailscale://devices/device-42",
      { deviceId: "device-42" },
    )) as { contents: Array<{ uri: string; mimeType: string; text: string }> };

    expect(result.contents).toHaveLength(1);
    const parsed = JSON.parse(result.contents[0].text);
    expect(parsed.device.id).toBe("device-42");
  });

  test("error path — getDevice throws → propagates error", async () => {
    const { server, svc } = buildServer();
    svc.getDevice = async () => {
      throw new Error("device not found");
    };

    await expect(
      server.callResource("device", "tailscale://devices/missing", {
        deviceId: "missing",
      }),
    ).rejects.toThrow("device not found");
  });
});

describe("acl-current resource", () => {
  test("success path — returns ACL text content", async () => {
    const { server, svc } = buildServer();
    svc.api.getACL = async () => ({
      success: true,
      data: '{"acls":[{"action":"accept","src":["*"],"dst":["*:*"]}]}',
    });

    const result = (await server.callResource(
      "acl-current",
      "tailscale://acl/current",
    )) as { contents: Array<{ uri: string; mimeType: string; text: string }> };

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe("application/hujson");
    expect(result.contents[0].text).toContain("accept");
  });

  test("error path — ACL read failure → throws with message", async () => {
    const { server, svc } = buildServer();
    svc.api.getACL = async () => ({
      success: false,
      error: "ACL read forbidden",
    });

    await expect(
      server.callResource("acl-current", "tailscale://acl/current"),
    ).rejects.toThrow("ACL read forbidden");
  });

  test("error path — getACL throws → propagates error", async () => {
    const { server, svc } = buildServer();
    svc.api.getACL = async () => {
      throw new Error("network timeout");
    };

    await expect(
      server.callResource("acl-current", "tailscale://acl/current"),
    ).rejects.toThrow("network timeout");
  });
});
