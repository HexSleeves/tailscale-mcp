import { describe, expect, test } from "bun:test";
import { loadConfig } from "../../config/env.js";

describe("loadConfig", () => {
  test("uses safe stdio defaults with oauth credentials", () => {
    const config = loadConfig({
      TAILSCALE_OAUTH_CLIENT_ID: "client-id",
      TAILSCALE_OAUTH_CLIENT_SECRET: "client-secret",
    });

    expect(config.MCP_TRANSPORT).toBe("stdio");
    expect(config.MCP_HTTP_BIND_HOST).toBe("127.0.0.1");
    expect(config.MCP_HTTP_PORT).toBe(3000);
    expect(config.TAILSCALE_TAILNET).toBe("-");
    expect(config.TAILSCALE_ALLOWED_TOOL_RISK).toBe("read");
  });

  test("rejects missing Tailscale credentials", () => {
    expect(() => loadConfig({})).toThrow(
      "Set OAuth credentials or TAILSCALE_API_KEY",
    );
  });

  test("requires bearer token for HTTP transport", () => {
    expect(() =>
      loadConfig({
        MCP_TRANSPORT: "http",
        TAILSCALE_API_KEY: "tskey-test",
      }),
    ).toThrow("HTTP transport requires MCP_HTTP_BEARER_TOKEN");
  });

  test("rejects non-loopback http API base URL", () => {
    expect(() =>
      loadConfig({
        TAILSCALE_API_KEY: "tskey-test",
        TAILSCALE_API_BASE_URL: "http://api.tailscale.com",
      }),
    ).toThrow("TAILSCALE_API_BASE_URL must use https");
  });

  test("allows loopback http API base URL incl. bracketed IPv6", () => {
    for (const url of [
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "http://[::1]:8080",
    ]) {
      const config = loadConfig({
        TAILSCALE_API_KEY: "tskey-test",
        TAILSCALE_API_BASE_URL: url,
      });
      expect(config.TAILSCALE_API_BASE_URL).toBe(url);
    }
  });
});
