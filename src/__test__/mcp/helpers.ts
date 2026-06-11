/**
 * Shared test helpers for MCP tool/resource tests.
 *
 * Importers: none — new test helper file
 * Affected surface: new tests only
 * Data files: none
 * User instruction: "Execute all"
 */
import type { AppConfig } from "../../config/env.js";
import type {
  DeviceSummary,
  TailnetSummary,
} from "../../mcp/schemas/tailscale.js";
import type { AppLogger } from "../../observability/logger.js";
import type { TailscaleService } from "../../tailscale/service.js";

// Minimal logger that satisfies AppLogger without producing output.
export const silentLogger: AppLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  flush: async () => {},
  close: async () => {},
};

// Read-only config (lowest risk level).
export function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    MCP_TRANSPORT: "stdio",
    MCP_HTTP_BIND_HOST: "127.0.0.1",
    MCP_HTTP_PORT: 3000,
    MCP_HTTP_BEARER_TOKEN: undefined,
    MCP_ALLOWED_HOSTS: undefined,
    TAILSCALE_TAILNET: "-",
    TAILSCALE_API_BASE_URL: "https://api.tailscale.com",
    TAILSCALE_API_KEY: "tskey-test",
    TAILSCALE_OAUTH_CLIENT_ID: undefined,
    TAILSCALE_OAUTH_CLIENT_SECRET: undefined,
    TAILSCALE_CLI_PATH: "tailscale",
    TAILSCALE_ALLOWED_TOOL_RISK: "read",
    LOG_LEVEL: "error",
    MCP_SERVER_LOG_FILE: undefined,
    ...overrides,
  } as AppConfig;
}

export const sampleDevice: DeviceSummary = {
  id: "device-1",
  name: "test-machine",
  hostname: "test-machine",
  os: "linux",
  online: true,
  authorized: true,
  lastSeen: "2024-01-01T00:00:00Z",
  addresses: ["100.64.0.1"],
  advertisedRoutes: [],
  enabledRoutes: [],
  tags: [],
};

export const sampleSummary: TailnetSummary = {
  name: "my-tailnet",
  organization: "example",
  devices: [sampleDevice],
};

// Minimal fake TailscaleService with all methods stubbed.
// Individual tests override specific methods as needed.
export function makeFakeService(): TailscaleService {
  const fakeApi = {
    getACL: async () => ({ success: true, data: '{"acls":[]}' }),
    updateACL: async (_body: string) => ({ success: true, data: undefined }),
    validateACL: async (_body: string) => ({
      success: true,
      data: { message: "ACL is valid" },
    }),
    listAuthKeys: async () => ({ success: true, data: [] }),
    createAuthKey: async (_cfg: unknown) => ({
      success: true,
      data: { id: "key-1" },
    }),
    deleteAuthKey: async (_id: string) => ({ success: true, data: undefined }),
    getDNSNameservers: async () => ({
      success: true,
      data: { dns: ["1.1.1.1"] },
    }),
    setDNSNameservers: async (_ns: string[]) => ({
      success: true,
      data: undefined,
    }),
    getDNSPreferences: async () => ({
      success: true,
      data: { magicDNS: true },
    }),
    setDNSPreferences: async (_m: boolean) => ({
      success: true,
      data: undefined,
    }),
    getDNSSearchPaths: async () => ({
      success: true,
      data: { searchPaths: [] },
    }),
    setDNSSearchPaths: async (_sp: string[]) => ({
      success: true,
      data: undefined,
    }),
    getTailnetSettings: async () => ({
      success: true,
      data: { fileSharing: false },
    }),
    setTailnetSettings: async (_s: unknown) => ({
      success: true,
      data: undefined,
    }),
    listWebhooks: async () => ({ success: true, data: [] }),
    createWebhook: async (_cfg: unknown) => ({
      success: true,
      data: { id: "wh-1" },
    }),
    testWebhook: async (_id: string) => ({ success: true, data: undefined }),
    deleteWebhook: async (_id: string) => ({ success: true, data: undefined }),
    setDeviceTags: async (_id: string, _tags: string[]) => ({
      success: true,
      data: undefined,
    }),
    getDeviceRoutes: async (_id: string) => ({
      success: true,
      data: { advertisedRoutes: [], enabledRoutes: [] },
    }),
    setDeviceRoutes: async (_id: string, _routes: string[]) => ({
      success: true,
      data: undefined,
    }),
    getTailnetInfo: async () => ({
      success: true,
      data: { name: "my-tailnet" },
    }),
    listDevices: async (_opts?: unknown) => ({ success: true, data: [] }),
    getDevice: async (_id: string) => ({ success: true, data: sampleDevice }),
    setDeviceAuthorized: async (_id: string, _auth: boolean) => ({
      success: true,
      data: undefined,
    }),
    deleteDevice: async (_id: string) => ({ success: true, data: undefined }),
    expireDeviceKey: async (_id: string) => ({
      success: true,
      data: undefined,
    }),
  };

  const fakeCli = {
    status: async () => ({ success: true, data: { Self: {}, Peer: {} } }),
    connect: async (_opts: unknown) => ({ success: true, data: "Connected" }),
    disconnect: async () => ({ success: true, data: "Disconnected" }),
    ping: async (_target: string, _count: number) => ({
      success: true,
      data: "pong",
    }),
    version: async () => ({ success: true, data: "1.50.0" }),
    setExitNode: async (_deviceId?: string) => ({
      success: true,
      data: "Exit node set",
    }),
    listDevices: async () => ({ success: true, data: [sampleDevice] }),
  };

  return {
    api: fakeApi,
    cli: fakeCli,
    listDevices: async (_opts?: {
      includeOffline?: boolean;
      includeRoutes?: boolean;
    }) => [sampleDevice],
    getDevice: async (_id: string) => sampleDevice,
    deviceAction: async (_id: string, _action: string) =>
      `Successfully performed authorize on ${_id}`,
    manageRoutes: async (_id: string, _routes: string[], _enable: boolean) =>
      "Enabled routes for device-1",
    getNetworkStatus: async () => ({ Self: {}, Peer: {} }),
    connect: async (_opts: unknown) => "Connected",
    disconnect: async () => "Disconnected",
    ping: async (_target: string, _count: number) => "pong",
    getVersion: async () => "1.50.0",
    getTailnetSummary: async () => sampleSummary,
  } as unknown as TailscaleService;
}

// Minimal McpServer stand-in that records registered tool names and handlers.
export class CapturingServer {
  readonly toolNames: string[] = [];
  readonly resourceNames: string[] = [];

  // Maps tool name → registered handler function.
  readonly toolHandlers = new Map<
    string,
    (input: unknown) => Promise<unknown>
  >();
  // Maps resource name → registered handler function.
  readonly resourceHandlers = new Map<
    string,
    (uri: URL, variables: Record<string, unknown>) => Promise<unknown>
  >();

  registerTool(
    name: string,
    _def: unknown,
    handler: (input: unknown) => Promise<unknown>,
  ): void {
    this.toolNames.push(name);
    this.toolHandlers.set(name, handler);
  }

  registerResource(
    name: string,
    _uriOrTemplate: unknown,
    _meta: unknown,
    handler: (uri: URL, variables: Record<string, unknown>) => Promise<unknown>,
  ): void {
    this.resourceNames.push(name);
    this.resourceHandlers.set(name, handler);
  }

  /** Invoke a registered tool handler by name. */
  async callTool(name: string, input: unknown = {}): Promise<unknown> {
    const handler = this.toolHandlers.get(name);
    if (!handler) throw new Error(`No handler registered for tool "${name}"`);
    return handler(input);
  }

  /** Invoke a registered resource handler by name. */
  async callResource(
    name: string,
    uri = "tailscale://test",
    variables: Record<string, unknown> = {},
  ): Promise<unknown> {
    const handler = this.resourceHandlers.get(name);
    if (!handler) {
      throw new Error(`No handler registered for resource "${name}"`);
    }
    return handler(new URL(uri), variables);
  }
}
