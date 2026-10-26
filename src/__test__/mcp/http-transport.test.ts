import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { createHttpApp } from "../../mcp/transports/http.js";
import type { TailscaleService } from "../../tailscale/service.js";
import { makeConfig, silentLogger } from "./helpers.js";

let server: Server;
let port: number;

beforeAll(async () => {
  const app = createHttpApp({
    config: makeConfig({
      MCP_HTTP_BEARER_TOKEN: "secret",
      MCP_ALLOWED_HOSTS: "custom.local,fd7a::1",
    }),
    logger: silentLogger,
    tailscale: {} as TailscaleService,
  });
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
});

function send(
  method: string,
  path: string,
  host: string,
  { token, body }: { token?: string; body?: string } = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          host,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

const getMcp = (host: string, token?: string) =>
  send("GET", "/mcp", host, { token });

describe("HTTP transport Host check", () => {
  test("accepts tailnet and allowlisted hosts", async () => {
    expect(await getMcp("mcp.tailnet-name.ts.net", "secret")).toBe(405);
    expect(await getMcp("custom.local:3000", "secret")).toBe(405);
    expect(await getMcp(`localhost:${port}`, "secret")).toBe(405);
    expect(await getMcp(`[::1]:${port}`, "secret")).toBe(405);
    expect(await getMcp("[fd7a::1]:3000", "secret")).toBe(405);
  });

  test("rejects other hosts before checking the token", async () => {
    expect(await getMcp("evil.example.com", "secret")).toBe(403);
    expect(await getMcp("evil.example.com")).toBe(403);
  });

  test("requires the bearer token on an allowed host", async () => {
    expect(await getMcp("mcp.tailnet-name.ts.net")).toBe(401);
  });

  test("rejects a disallowed host before reading the body", async () => {
    expect(
      await send("POST", "/mcp", "evil.example.com", { body: "{bad" }),
    ).toBe(403);
    expect(
      await send("POST", "/other", "evil.example.com", { body: "{bad" }),
    ).toBe(404);
  });
});
