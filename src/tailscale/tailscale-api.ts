import { ZodError } from "zod";
import { getErrorMessage } from "../errors.ts";
import type { Logger } from "../logger.ts";
import type {
  ACLTestResult,
  ACLValidationResult,
  AuditLogList,
  AuthKeyList,
  CreateAuthKeyRequest,
  DevicePosture,
  DeviceRoutes,
  DeviceStats,
  NetworkLockStatus,
  NetworkStats,
  PosturePolicy,
  SSHSettings,
  TailnetInfo,
  TailscaleAPIResponse,
  TailscaleConfig,
  TailscaleDevice,
  User,
  UserList,
  Webhook,
  WebhookList,
} from "../types.ts";
import { TailscaleDeviceSchema } from "../types.ts";
import { TailscaleOAuthManager } from "./oauth.ts";

export type AuthMode = "api_key" | "oauth" | "none";

function reshapeError<T>(r: {
  success: boolean;
  error?: string;
  statusCode?: number;
}): TailscaleAPIResponse<T> {
  return { success: false, error: r.error, statusCode: r.statusCode };
}

export class TailscaleAPI {
  private readonly log: Logger;
  private readonly tailnet: string;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly authMode: AuthMode;
  private readonly oauth: TailscaleOAuthManager | null;

  constructor(
    config: TailscaleConfig,
    deps: { log: Logger; oauth?: TailscaleOAuthManager },
  ) {
    this.log = deps.log;
    this.oauth = deps.oauth ?? null;

    const apiKey = config.apiKey ?? process.env.TAILSCALE_API_KEY;
    this.tailnet = config.tailnet ?? process.env.TAILSCALE_TAILNET ?? "-";
    this.baseUrl =
      config.apiBaseUrl ??
      process.env.TAILSCALE_API_BASE_URL ??
      "https://api.tailscale.com";

    if (this.oauth) {
      this.authMode = "oauth";
      this.apiKey = undefined;
      this.log.info(
        "Using OAuth authentication for Tailscale API (scoped permissions)",
      );
    } else if (apiKey) {
      this.authMode = "api_key";
      this.apiKey = apiKey;
      this.log.debug("Using API key authentication for Tailscale API");
    } else {
      this.authMode = "none";
      this.apiKey = undefined;
      this.log.warn(
        "No Tailscale credentials provided. API operations will fail. Set TAILSCALE_API_KEY or TAILSCALE_OAUTH_CLIENT_ID/SECRET.",
      );
    }
  }

  getAuthMode(): AuthMode {
    return this.authMode;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<TailscaleAPIResponse<T>> {
    const url = `${this.baseUrl}/api/v2${path}`;

    let authHeader: string;
    if (this.authMode === "oauth" && this.oauth) {
      try {
        const token = await this.oauth.getAccessToken();
        authHeader = `Bearer ${token}`;
      } catch (err) {
        return { success: false, error: getErrorMessage(err) };
      }
    } else if (this.authMode === "api_key" && this.apiKey) {
      authHeader = `Basic ${btoa(`${this.apiKey}:`)}`;
    } else {
      authHeader = "";
    }

    const headers: Record<string, string> = { Authorization: authHeader };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    this.log.debug(`API Request: ${method.toUpperCase()} ${url}`);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }

    this.log.debug(`API Response: ${response.status} ${url}`);

    if (response.ok) {
      if (response.status === 204) {
        return {
          success: true,
          data: undefined as T,
          statusCode: response.status,
        };
      }
      const data = (await response.json()) as T;
      return { success: true, data, statusCode: response.status };
    }

    let errMsg = response.statusText;
    try {
      const errBody = (await response.json()) as Record<string, unknown>;
      if (typeof errBody.message === "string") {
        errMsg = errBody.message;
      } else if (typeof errBody.error === "string") {
        errMsg = errBody.error;
      }
    } catch {
      // ignore parse failure
    }

    return { success: false, error: errMsg, statusCode: response.status };
  }

  async listDevices(): Promise<TailscaleAPIResponse<TailscaleDevice[]>> {
    const result = await this.request<{ devices: TailscaleDevice[] }>(
      "GET",
      `/tailnet/${this.tailnet}/devices`,
    );

    if (!result.success) return reshapeError(result);

    const devices = (result.data?.devices ?? [])
      .map((device) => {
        try {
          return TailscaleDeviceSchema.parse(device);
        } catch (parseError) {
          this.log.warn({ device, err: parseError }, "Failed to parse device");
          return null;
        }
      })
      .filter((d): d is TailscaleDevice => d !== null);

    return { success: true, data: devices, statusCode: result.statusCode };
  }

  async getDevice(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<TailscaleDevice>> {
    const result = await this.request<unknown>("GET", `/device/${deviceId}`);
    if (!result.success) return reshapeError(result);

    try {
      const device = TailscaleDeviceSchema.parse(result.data);
      return { success: true, data: device, statusCode: result.statusCode };
    } catch (error) {
      if (error instanceof ZodError) {
        return {
          success: false,
          error: "Invalid device data received from API",
        };
      }
      return { success: false, error: getErrorMessage(error) };
    }
  }

  async authorizeDevice(deviceId: string): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>("POST", `/device/${deviceId}/authorized`, {
      authorized: true,
    });
  }

  async deauthorizeDevice(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>("POST", `/device/${deviceId}/authorized`, {
      authorized: false,
    });
  }

  async deleteDevice(deviceId: string): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>("DELETE", `/device/${deviceId}`);
  }

  async expireDeviceKey(deviceId: string): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>("POST", `/device/${deviceId}/expire`);
  }

  async enableDeviceRoutes(
    deviceId: string,
    routes: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>("POST", `/device/${deviceId}/routes`, { routes });
  }

  async disableDeviceRoutes(
    deviceId: string,
    routes: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>("DELETE", `/device/${deviceId}/routes`, {
      routes,
    });
  }

  async getTailnetInfo(): Promise<TailscaleAPIResponse<TailnetInfo>> {
    return this.request<TailnetInfo>("GET", `/tailnet/${this.tailnet}`);
  }

  async testConnection(): Promise<TailscaleAPIResponse<{ status: string }>> {
    const result = await this.request<unknown>(
      "GET",
      `/tailnet/${this.tailnet}/devices?limit=1`,
    );
    if (result.success) {
      return {
        success: true,
        data: { status: "connected" },
        statusCode: result.statusCode,
      };
    }
    return reshapeError(result);
  }

  async getVersion(): Promise<
    TailscaleAPIResponse<{ version: string; apiVersion: string }>
  > {
    return {
      success: true,
      data: { version: "API v2", apiVersion: "2.0" },
      statusCode: 200,
    };
  }

  async connect(): Promise<TailscaleAPIResponse<{ message: string }>> {
    return {
      success: false,
      error:
        "Network connection is only available via CLI. Use the CLI 'up' command instead.",
      statusCode: 501,
    };
  }

  async disconnect(): Promise<TailscaleAPIResponse<{ message: string }>> {
    return {
      success: false,
      error:
        "Network disconnection is only available via CLI. Use the CLI 'down' command instead.",
      statusCode: 501,
    };
  }

  async getACL(): Promise<TailscaleAPIResponse<string>> {
    return this.request<string>("GET", `/tailnet/${this.tailnet}/acl`);
  }

  async updateACL(aclConfig: string): Promise<TailscaleAPIResponse<void>> {
    const url = `/tailnet/${this.tailnet}/acl`;
    const fullUrl = `${this.baseUrl}/api/v2${url}`;

    let authHeader: string;
    if (this.authMode === "oauth" && this.oauth) {
      try {
        const token = await this.oauth.getAccessToken();
        authHeader = `Bearer ${token}`;
      } catch (err) {
        return { success: false, error: getErrorMessage(err) };
      }
    } else if (this.authMode === "api_key" && this.apiKey) {
      authHeader = `Basic ${btoa(`${this.apiKey}:`)}`;
    } else {
      authHeader = "";
    }

    let response: Response;
    try {
      response = await fetch(fullUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/hujson",
        },
        body: aclConfig,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }

    if (response.ok) {
      return { success: true, data: undefined, statusCode: response.status };
    }

    let errMsg = response.statusText;
    try {
      const errBody = (await response.json()) as Record<string, unknown>;
      if (typeof errBody.message === "string") errMsg = errBody.message;
      else if (typeof errBody.error === "string") errMsg = errBody.error;
    } catch {
      /* ignore */
    }

    return { success: false, error: errMsg, statusCode: response.status };
  }

  async validateACL(
    aclConfig: string,
  ): Promise<TailscaleAPIResponse<ACLValidationResult>> {
    const url = `/tailnet/${this.tailnet}/acl/validate`;
    const fullUrl = `${this.baseUrl}/api/v2${url}`;

    let authHeader: string;
    if (this.authMode === "oauth" && this.oauth) {
      try {
        const token = await this.oauth.getAccessToken();
        authHeader = `Bearer ${token}`;
      } catch (err) {
        return { success: false, error: getErrorMessage(err) };
      }
    } else if (this.authMode === "api_key" && this.apiKey) {
      authHeader = `Basic ${btoa(`${this.apiKey}:`)}`;
    } else {
      authHeader = "";
    }

    let response: Response;
    try {
      response = await fetch(fullUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/hujson",
        },
        body: aclConfig,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }

    if (response.ok) {
      if (response.status === 204)
        return {
          success: true,
          data: undefined as unknown as ACLValidationResult,
          statusCode: response.status,
        };
      const data = (await response.json()) as ACLValidationResult;
      return { success: true, data, statusCode: response.status };
    }

    let errMsg = response.statusText;
    try {
      const errBody = (await response.json()) as Record<string, unknown>;
      if (typeof errBody.message === "string") errMsg = errBody.message;
      else if (typeof errBody.error === "string") errMsg = errBody.error;
    } catch {
      /* ignore */
    }

    return { success: false, error: errMsg, statusCode: response.status };
  }

  async getDNSNameservers(): Promise<TailscaleAPIResponse<{ dns: string[] }>> {
    return this.request<{ dns: string[] }>(
      "GET",
      `/tailnet/${this.tailnet}/dns/nameservers`,
    );
  }

  async setDNSNameservers(
    nameservers: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>(
      "POST",
      `/tailnet/${this.tailnet}/dns/nameservers`,
      { dns: nameservers },
    );
  }

  async getDNSPreferences(): Promise<
    TailscaleAPIResponse<{ magicDNS: boolean }>
  > {
    return this.request<{ magicDNS: boolean }>(
      "GET",
      `/tailnet/${this.tailnet}/dns/preferences`,
    );
  }

  async setDNSPreferences(
    magicDNS: boolean,
  ): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>(
      "POST",
      `/tailnet/${this.tailnet}/dns/preferences`,
      { magicDNS },
    );
  }

  async getDNSSearchPaths(): Promise<
    TailscaleAPIResponse<{ searchPaths: string[] }>
  > {
    return this.request<{ searchPaths: string[] }>(
      "GET",
      `/tailnet/${this.tailnet}/dns/searchpaths`,
    );
  }

  async setDNSSearchPaths(
    searchPaths: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>(
      "POST",
      `/tailnet/${this.tailnet}/dns/searchpaths`,
      { searchPaths },
    );
  }

  async listAuthKeys(): Promise<TailscaleAPIResponse<AuthKeyList>> {
    return this.request<AuthKeyList>("GET", `/tailnet/${this.tailnet}/keys`);
  }

  async createAuthKey(
    keyConfig: CreateAuthKeyRequest,
  ): Promise<
    TailscaleAPIResponse<{ key: string; id: string; description?: string }>
  > {
    return this.request<{ key: string; id: string; description?: string }>(
      "POST",
      `/tailnet/${this.tailnet}/keys`,
      keyConfig,
    );
  }

  async deleteAuthKey(keyId: string): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>(
      "DELETE",
      `/tailnet/${this.tailnet}/keys/${keyId}`,
    );
  }

  async getDetailedTailnetInfo(): Promise<TailscaleAPIResponse<TailnetInfo>> {
    return this.getTailnetInfo();
  }

  async getFileSharingStatus(): Promise<
    TailscaleAPIResponse<{ fileSharing: boolean }>
  > {
    return this.request<{ fileSharing: boolean }>(
      "GET",
      `/tailnet/${this.tailnet}/settings`,
    );
  }

  async setFileSharingStatus(
    enabled: boolean,
  ): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>("POST", `/tailnet/${this.tailnet}/settings`, {
      fileSharing: enabled,
    });
  }

  async setDeviceExitNode(
    deviceId: string,
    routes: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    return this.enableDeviceRoutes(deviceId, routes);
  }

  async getDeviceRoutes(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<DeviceRoutes>> {
    return this.request<DeviceRoutes>("GET", `/device/${deviceId}/routes`);
  }

  async getNetworkLockStatus(): Promise<
    TailscaleAPIResponse<NetworkLockStatus>
  > {
    return this.request<NetworkLockStatus>(
      "GET",
      `/tailnet/${this.tailnet}/network-lock`,
    );
  }

  async enableNetworkLock(): Promise<TailscaleAPIResponse<NetworkLockStatus>> {
    return this.request<NetworkLockStatus>(
      "POST",
      `/tailnet/${this.tailnet}/network-lock`,
    );
  }

  async disableNetworkLock(): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>(
      "DELETE",
      `/tailnet/${this.tailnet}/network-lock`,
    );
  }

  async listWebhooks(): Promise<TailscaleAPIResponse<WebhookList>> {
    return this.request<WebhookList>(
      "GET",
      `/tailnet/${this.tailnet}/webhooks`,
    );
  }

  async createWebhook(config: {
    endpointUrl: string;
    secret?: string;
    events: string[];
    description?: string;
  }): Promise<TailscaleAPIResponse<Webhook>> {
    return this.request<Webhook>(
      "POST",
      `/tailnet/${this.tailnet}/webhooks`,
      config,
    );
  }

  async deleteWebhook(webhookId: string): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>(
      "DELETE",
      `/tailnet/${this.tailnet}/webhooks/${webhookId}`,
    );
  }

  async testWebhook(
    webhookId: string,
  ): Promise<TailscaleAPIResponse<{ success: boolean; message?: string }>> {
    return this.request<{ success: boolean; message?: string }>(
      "POST",
      `/tailnet/${this.tailnet}/webhooks/${webhookId}/test`,
    );
  }

  async getPolicyFile(): Promise<TailscaleAPIResponse<string>> {
    const url = `/tailnet/${this.tailnet}/acl`;
    const fullUrl = `${this.baseUrl}/api/v2${url}`;

    let authHeader: string;
    if (this.authMode === "oauth" && this.oauth) {
      try {
        const token = await this.oauth.getAccessToken();
        authHeader = `Bearer ${token}`;
      } catch (err) {
        return { success: false, error: getErrorMessage(err) };
      }
    } else if (this.authMode === "api_key" && this.apiKey) {
      authHeader = `Basic ${btoa(`${this.apiKey}:`)}`;
    } else {
      authHeader = "";
    }

    let response: Response;
    try {
      response = await fetch(fullUrl, {
        method: "GET",
        headers: { Authorization: authHeader, Accept: "application/hujson" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }

    if (response.ok) {
      const text = await response.text();
      return { success: true, data: text, statusCode: response.status };
    }

    let errMsg = response.statusText;
    try {
      const errBody = (await response.json()) as Record<string, unknown>;
      if (typeof errBody.message === "string") errMsg = errBody.message;
      else if (typeof errBody.error === "string") errMsg = errBody.error;
    } catch {
      /* ignore */
    }

    return { success: false, error: errMsg, statusCode: response.status };
  }

  async testACLAccess(
    src: string,
    dst: string,
    proto?: string,
  ): Promise<TailscaleAPIResponse<ACLTestResult>> {
    const params = new URLSearchParams({
      src,
      dst,
      ...(proto ? { proto } : {}),
    });
    return this.request<ACLTestResult>(
      "GET",
      `/tailnet/${this.tailnet}/acl/test?${params.toString()}`,
    );
  }

  async getDeviceTags(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<{ tags: string[] }>> {
    const result = await this.request<{ tags?: string[] }>(
      "GET",
      `/device/${deviceId}`,
    );
    if (!result.success) return reshapeError(result);
    return {
      success: true,
      data: { tags: result.data?.tags ?? [] },
      statusCode: result.statusCode,
    };
  }

  async setDeviceTags(
    deviceId: string,
    tags: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>("POST", `/device/${deviceId}/tags`, { tags });
  }

  async getSSHSettings(): Promise<TailscaleAPIResponse<SSHSettings>> {
    return this.request<SSHSettings>("GET", `/tailnet/${this.tailnet}/ssh`);
  }

  async updateSSHSettings(
    settings: Partial<SSHSettings>,
  ): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>("POST", `/tailnet/${this.tailnet}/ssh`, settings);
  }

  async getNetworkStats(): Promise<TailscaleAPIResponse<NetworkStats>> {
    return this.request<NetworkStats>("GET", `/tailnet/${this.tailnet}/stats`);
  }

  async getDeviceStats(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<DeviceStats>> {
    return this.request<DeviceStats>("GET", `/device/${deviceId}/stats`);
  }

  async getUsers(): Promise<TailscaleAPIResponse<UserList>> {
    return this.request<UserList>("GET", `/tailnet/${this.tailnet}/users`);
  }

  async getUser(userId: string): Promise<TailscaleAPIResponse<User>> {
    return this.request<User>(
      "GET",
      `/tailnet/${this.tailnet}/users/${userId}`,
    );
  }

  async updateUserRole(
    userId: string,
    role: string,
  ): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>(
      "POST",
      `/tailnet/${this.tailnet}/users/${userId}`,
      { role },
    );
  }

  async getAuditLogs(): Promise<TailscaleAPIResponse<AuditLogList>> {
    return this.request<AuditLogList>("GET", `/tailnet/${this.tailnet}/logs`);
  }

  async getDevicePosture(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<DevicePosture>> {
    return this.request<DevicePosture>("GET", `/device/${deviceId}/posture`);
  }

  async setDevicePosturePolicy(
    policy: PosturePolicy,
  ): Promise<TailscaleAPIResponse<void>> {
    return this.request<void>(
      "POST",
      `/tailnet/${this.tailnet}/posture-policy`,
      policy,
    );
  }
}

export function createTailscaleAPI(deps: { log: Logger }): TailscaleAPI {
  const apiKey = process.env.TAILSCALE_API_KEY;
  const tailnet = process.env.TAILSCALE_TAILNET;
  const apiBaseUrl = process.env.TAILSCALE_API_BASE_URL;
  const oauth = TailscaleOAuthManager.fromEnvironment(deps);

  return new TailscaleAPI(
    { apiKey, tailnet, apiBaseUrl },
    { log: deps.log, oauth: oauth ?? undefined },
  );
}
