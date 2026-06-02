import type { AppConfig } from "../config/env.js";
import type { AppLogger } from "../observability/logger.js";
import { OAuthTokenProvider } from "./oauth-token-provider.js";

export interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export class TailscaleApiClient {
  private readonly oauth: OAuthTokenProvider;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: AppLogger,
  ) {
    this.oauth = new OAuthTokenProvider(config, logger);
  }

  async listDevices(
    options: { includeRoutes?: boolean } = {},
  ): Promise<ApiResult<unknown[]>> {
    const fields = options.includeRoutes ? "?fields=all" : "";
    const result = await this.request<{ devices?: unknown[] }>(
      `/tailnet/${this.tailnet}/devices${fields}`,
    );
    if (!result.success) {
      return result as ApiResult<unknown[]>;
    }
    return { ...result, data: result.data?.devices ?? [] };
  }

  async getDevice(deviceId: string): Promise<ApiResult<unknown>> {
    return this.request(`/device/${encodeURIComponent(deviceId)}`);
  }

  async setDeviceAuthorized(
    deviceId: string,
    authorized: boolean,
  ): Promise<ApiResult<unknown>> {
    return this.request(`/device/${encodeURIComponent(deviceId)}/authorized`, {
      method: "POST",
      json: { authorized },
    });
  }

  async deleteDevice(deviceId: string): Promise<ApiResult<unknown>> {
    return this.request(`/device/${encodeURIComponent(deviceId)}`, {
      method: "DELETE",
    });
  }

  async expireDeviceKey(deviceId: string): Promise<ApiResult<unknown>> {
    return this.request(`/device/${encodeURIComponent(deviceId)}/expire`, {
      method: "POST",
    });
  }

  async getDeviceRoutes(deviceId: string): Promise<ApiResult<unknown>> {
    return this.request(`/device/${encodeURIComponent(deviceId)}/routes`);
  }

  async setDeviceRoutes(
    deviceId: string,
    routes: string[],
  ): Promise<ApiResult<unknown>> {
    return this.request(`/device/${encodeURIComponent(deviceId)}/routes`, {
      method: "POST",
      json: { routes },
    });
  }

  async getTailnetInfo(): Promise<ApiResult<unknown>> {
    return this.request(`/tailnet/${this.tailnet}`);
  }

  async getACL(): Promise<ApiResult<string>> {
    return this.request(`/tailnet/${this.tailnet}/acl`, {
      accept: "application/hujson",
    });
  }

  async updateACL(aclConfig: string): Promise<ApiResult<unknown>> {
    return this.request(`/tailnet/${this.tailnet}/acl`, {
      method: "POST",
      body: aclConfig,
      contentType: "application/hujson",
    });
  }

  async validateACL(aclConfig: string): Promise<ApiResult<unknown>> {
    return this.request(`/tailnet/${this.tailnet}/acl/validate`, {
      method: "POST",
      body: aclConfig,
      contentType: "application/hujson",
    });
  }

  async getDNSNameservers(): Promise<ApiResult<unknown>> {
    return this.request(`/tailnet/${this.tailnet}/dns/nameservers`);
  }

  async setDNSNameservers(nameservers: string[]): Promise<ApiResult<unknown>> {
    return this.request(`/tailnet/${this.tailnet}/dns/nameservers`, {
      method: "POST",
      json: { dns: nameservers },
    });
  }

  async getDNSPreferences(): Promise<ApiResult<unknown>> {
    return this.request(`/tailnet/${this.tailnet}/dns/preferences`);
  }

  async setDNSPreferences(magicDNS: boolean): Promise<ApiResult<unknown>> {
    return this.request(`/tailnet/${this.tailnet}/dns/preferences`, {
      method: "POST",
      json: { magicDNS },
    });
  }

  async getDNSSearchPaths(): Promise<ApiResult<unknown>> {
    return this.request(`/tailnet/${this.tailnet}/dns/searchpaths`);
  }

  async setDNSSearchPaths(searchPaths: string[]): Promise<ApiResult<unknown>> {
    return this.request(`/tailnet/${this.tailnet}/dns/searchpaths`, {
      method: "POST",
      json: { searchPaths },
    });
  }

  async listAuthKeys(): Promise<ApiResult<unknown>> {
    return this.request(`/tailnet/${this.tailnet}/keys`);
  }

  async createAuthKey(keyConfig: unknown): Promise<ApiResult<unknown>> {
    return this.request(`/tailnet/${this.tailnet}/keys`, {
      method: "POST",
      json: keyConfig,
    });
  }

  async deleteAuthKey(keyId: string): Promise<ApiResult<unknown>> {
    return this.request(
      `/tailnet/${this.tailnet}/keys/${encodeURIComponent(keyId)}`,
      {
        method: "DELETE",
      },
    );
  }

  async getTailnetSettings(): Promise<ApiResult<unknown>> {
    return this.request(`/tailnet/${this.tailnet}/settings`);
  }

  async setTailnetSettings(settings: unknown): Promise<ApiResult<unknown>> {
    return this.request(`/tailnet/${this.tailnet}/settings`, {
      method: "POST",
      json: settings,
    });
  }

  async listWebhooks(): Promise<ApiResult<unknown>> {
    return this.request(`/tailnet/${this.tailnet}/webhooks`);
  }

  async createWebhook(config: unknown): Promise<ApiResult<unknown>> {
    return this.request(`/tailnet/${this.tailnet}/webhooks`, {
      method: "POST",
      json: config,
    });
  }

  async deleteWebhook(webhookId: string): Promise<ApiResult<unknown>> {
    return this.request(
      `/tailnet/${this.tailnet}/webhooks/${encodeURIComponent(webhookId)}`,
      {
        method: "DELETE",
      },
    );
  }

  async testWebhook(webhookId: string): Promise<ApiResult<unknown>> {
    return this.request(
      `/tailnet/${this.tailnet}/webhooks/${encodeURIComponent(webhookId)}/test`,
      {
        method: "POST",
      },
    );
  }

  async setDeviceTags(
    deviceId: string,
    tags: string[],
  ): Promise<ApiResult<unknown>> {
    return this.request(`/device/${encodeURIComponent(deviceId)}/tags`, {
      method: "POST",
      json: { tags },
    });
  }

  private get tailnet(): string {
    return encodeURIComponent(this.config.TAILSCALE_TAILNET);
  }

  private async authHeader(): Promise<string> {
    if (this.oauth.isConfigured()) {
      return `Bearer ${await this.oauth.getAccessToken()}`;
    }

    if (this.config.TAILSCALE_API_KEY) {
      return `Bearer ${this.config.TAILSCALE_API_KEY}`;
    }

    throw new Error("No Tailscale API credentials configured");
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      json?: unknown;
      body?: BodyInit;
      accept?: string;
      contentType?: string;
    } = {},
  ): Promise<ApiResult<T>> {
    try {
      const headers = new Headers({
        Authorization: await this.authHeader(),
        Accept: options.accept ?? "application/json",
      });

      let body = options.body;
      if (options.json !== undefined) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(options.json);
      } else if (options.contentType) {
        headers.set("Content-Type", options.contentType);
      }

      const response = await fetch(
        `${this.config.TAILSCALE_API_BASE_URL}/api/v2${path}`,
        {
          method: options.method ?? "GET",
          headers,
          body,
        },
      );

      const contentType = response.headers.get("content-type") ?? "";
      const data =
        contentType.includes("application/json") ||
        contentType.includes("+json")
          ? await response.json()
          : await response.text();

      if (!response.ok) {
        const error =
          data && typeof data === "object" && "message" in data
            ? String(data.message)
            : data && typeof data === "object" && "error" in data
              ? String(data.error)
              : `HTTP ${response.status}`;

        return { success: false, error, statusCode: response.status };
      }

      return {
        success: true,
        data: data as T,
        statusCode: response.status,
      };
    } catch (error) {
      this.logger.error("Tailscale API request failed", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        statusCode: 0,
      };
    }
  }
}
