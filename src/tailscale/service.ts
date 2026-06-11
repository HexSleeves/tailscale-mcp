import type { AppConfig } from "../config/env.js";
import {
  type DeviceSummary,
  normalizeDevice,
  type TailnetSummary,
} from "../mcp/schemas/tailscale.js";
import type { AppLogger } from "../observability/logger.js";
import { type ApiResult, TailscaleApiClient } from "./api-client.js";
import { TailscaleCliClient } from "./cli-client.js";

export class TailscaleService {
  readonly api: TailscaleApiClient;
  readonly cli: TailscaleCliClient;

  private constructor(
    config: AppConfig,
    private readonly logger: AppLogger,
  ) {
    this.api = new TailscaleApiClient(config, logger);
    this.cli = new TailscaleCliClient(config.TAILSCALE_CLI_PATH, logger);
  }

  static async create({
    config,
    logger,
  }: {
    config: AppConfig;
    logger: AppLogger;
  }): Promise<TailscaleService> {
    return new TailscaleService(config, logger);
  }

  async listDevices(
    options: { includeOffline?: boolean; includeRoutes?: boolean } = {},
  ): Promise<DeviceSummary[]> {
    const apiResult = await this.api.listDevices({
      includeRoutes: options.includeRoutes,
    });
    if (apiResult.success) {
      return (apiResult.data ?? []).map(normalizeDevice).filter((device) => {
        return (options.includeOffline ?? true)
          ? true
          : device.online !== false;
      });
    }

    this.logger.warn("API device listing failed; trying CLI", apiResult.error);
    const cliResult = await this.cli.listDevices();
    if (!cliResult.success) {
      throw new Error(
        cliResult.error ?? apiResult.error ?? "Failed to list devices",
      );
    }

    return (cliResult.data ?? []).map(normalizeDevice).filter((device) => {
      return (options.includeOffline ?? true) ? true : device.online !== false;
    });
  }

  async getDevice(deviceId: string): Promise<DeviceSummary> {
    const result = await this.api.getDevice(deviceId);
    if (!result.success) {
      throw new Error(result.error ?? "Failed to get device");
    }
    return normalizeDevice(result.data);
  }

  async deviceAction(deviceId: string, action: string): Promise<string> {
    const result =
      action === "authorize"
        ? await this.api.setDeviceAuthorized(deviceId, true)
        : action === "deauthorize"
          ? await this.api.setDeviceAuthorized(deviceId, false)
          : action === "delete"
            ? await this.api.deleteDevice(deviceId)
            : action === "expire-key"
              ? await this.api.expireDeviceKey(deviceId)
              : ({
                  success: false,
                  error: `Unknown action: ${action}`,
                } as ApiResult<unknown>);

    if (!result.success) {
      throw new Error(result.error ?? `Failed to ${action} device`);
    }

    return `Successfully performed ${action} on ${deviceId}`;
  }

  async manageRoutes(
    deviceId: string,
    routes: string[],
    enabled: boolean,
  ): Promise<string> {
    const currentRoutes = await this.api.getDeviceRoutes(deviceId);
    if (!currentRoutes.success) {
      throw new Error(currentRoutes.error ?? "Failed to get current routes");
    }

    const enabledRoutes = new Set(
      readStringArray(currentRoutes.data, "enabledRoutes"),
    );
    for (const route of routes) {
      if (enabled) {
        enabledRoutes.add(route);
      } else {
        enabledRoutes.delete(route);
      }
    }

    const result = await this.api.setDeviceRoutes(deviceId, [...enabledRoutes]);
    if (!result.success) {
      throw new Error(result.error ?? "Failed to update routes");
    }
    return `${enabled ? "Enabled" : "Disabled"} routes for ${deviceId}`;
  }

  async getNetworkStatus(): Promise<unknown> {
    const cliResult = await this.cli.status();
    if (cliResult.success) {
      return cliResult.data;
    }

    const apiResult = await this.api.getTailnetInfo();
    if (!apiResult.success) {
      throw new Error(
        cliResult.error ?? apiResult.error ?? "Failed to get status",
      );
    }

    return apiResult.data;
  }

  async connect(options: Parameters<TailscaleCliClient["connect"]>[0]) {
    const result = await this.cli.connect(options);
    if (!result.success) {
      throw new Error(result.error ?? "Failed to connect");
    }
    return result.data ?? "Connected";
  }

  async disconnect() {
    const result = await this.cli.disconnect();
    if (!result.success) {
      throw new Error(result.error ?? "Failed to disconnect");
    }
    return result.data ?? "Disconnected";
  }

  async ping(target: string, count: number) {
    const result = await this.cli.ping(target, count);
    if (!result.success) {
      throw new Error(result.error ?? "Failed to ping peer");
    }
    return result.data ?? "";
  }

  async getVersion() {
    const result = await this.cli.version();
    if (result.success) {
      return result.data ?? "";
    }
    return { version: "Tailscale API v2", cliAvailable: false };
  }

  async getTailnetSummary(): Promise<TailnetSummary> {
    const [tailnet, devices] = await Promise.all([
      this.api.getTailnetInfo(),
      this.listDevices().catch((error) => {
        this.logger.warn(
          "Tailnet summary: device listing failed; returning summary without devices",
          error instanceof Error ? error.message : error,
        );
        return [] as DeviceSummary[];
      }),
    ]);
    const record =
      tailnet.success && tailnet.data && typeof tailnet.data === "object"
        ? (tailnet.data as Record<string, unknown>)
        : {};

    return {
      name: typeof record.name === "string" ? record.name : undefined,
      organization:
        typeof record.organization === "string"
          ? record.organization
          : undefined,
      dns: record.dns,
      magicDNS:
        typeof record.magicDNSEnabled === "boolean"
          ? record.magicDNSEnabled
          : undefined,
      fileSharing:
        typeof record.fileSharing === "boolean"
          ? record.fileSharing
          : undefined,
      networkLockEnabled:
        typeof record.networkLockEnabled === "boolean"
          ? record.networkLockEnabled
          : undefined,
      devices,
    };
  }
}

function readStringArray(value: unknown, key: string): string[] {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const routes = record[key];
  return Array.isArray(routes)
    ? routes.filter((route): route is string => typeof route === "string")
    : [];
}
