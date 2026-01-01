import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { ZodError } from "zod";
import { logger } from "../logger";
import {
  type ACLTestResult,
  type ACLValidationResult,
  type AuditLogList,
  type AuthKeyList,
  type CreateAuthKeyRequest,
  type DevicePosture,
  type DeviceRoutes,
  type DeviceStats,
  type NetworkLockStatus,
  type NetworkStats,
  type PosturePolicy,
  type SSHSettings,
  type TailnetInfo,
  type TailscaleAPIResponse,
  type TailscaleConfig,
  type TailscaleDevice,
  TailscaleDeviceSchema,
  type User,
  type UserList,
  type Webhook,
  type WebhookList,
} from "../types";
import { TailscaleOAuthManager } from "./oauth";

export type AuthMode = "api_key" | "oauth" | "none";

export class TailscaleAPI {
  private readonly client: AxiosInstance;
  private readonly tailnet: string;

  private readonly authMode: AuthMode;
  private readonly oauthManager: TailscaleOAuthManager | null = null;

  constructor(config: TailscaleConfig = {}) {
    const apiKey = config.apiKey || process.env.TAILSCALE_API_KEY;
    const oauthClientId =
      config.oauthClientId || process.env.TAILSCALE_OAUTH_CLIENT_ID;
    const oauthClientSecret =
      config.oauthClientSecret || process.env.TAILSCALE_OAUTH_CLIENT_SECRET;
    const tailnet = config.tailnet || process.env.TAILSCALE_TAILNET || "-";
    const baseUrl =
      config.apiBaseUrl ||
      process.env.TAILSCALE_API_BASE_URL ||
      "https://api.tailscale.com";

    // Determine auth mode
    if (oauthClientId && oauthClientSecret) {
      this.authMode = "oauth";
      this.oauthManager = new TailscaleOAuthManager({
        clientId: oauthClientId,
        clientSecret: oauthClientSecret,
        baseUrl,
      });
      logger.info(
        "Using OAuth authentication for Tailscale API (scoped permissions)",
      );
    } else if (apiKey) {
      this.authMode = "api_key";
      logger.debug("Using API key authentication for Tailscale API");
    } else {
      this.authMode = "none";
      logger.warn(
        "No Tailscale credentials provided. API operations will fail. Set TAILSCALE_API_KEY or TAILSCALE_OAUTH_CLIENT_ID/SECRET.",
      );
    }

    this.tailnet = tailnet;
    this.client = axios.create({
      timeout: 30000,
      baseURL: `${baseUrl}/api/v2`,
      headers: {
        // For API key auth, set static header; for OAuth, we'll set it dynamically
        Authorization:
          this.authMode === "api_key" && apiKey ? `Bearer ${apiKey}` : "",
        "Content-Type": "application/json",
      },
    });

    // Add request interceptor for OAuth token injection and logging
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        // Inject OAuth token if using OAuth auth
        if (this.authMode === "oauth" && this.oauthManager) {
          try {
            const token = await this.oauthManager.getAccessToken();
            config.headers.Authorization = `Bearer ${token}`;
          } catch (error) {
            logger.error("Failed to get OAuth token for request:", error);
            throw error;
          }
        }

        logger.debug(
          `API Request: ${config.method?.toUpperCase()} ${config.url}`,
        );
        return config;
      },
      (error) => {
        logger.error("API Request Error:", {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.message,
        });
        return Promise.reject(error);
      },
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error("API Response Error:", {
          url: error.config?.url,
          status: error.response?.status,
          data: error.response?.data,
        });
        return Promise.reject(error);
      },
    );
  }

  /**
   * Get the current authentication mode
   */
  getAuthMode(): AuthMode {
    return this.authMode;
  }

  /**
   * Handle API response and convert to standardized format
   */
  private handleResponse<T>(
    response: AxiosResponse<T>,
  ): TailscaleAPIResponse<T> {
    return {
      success: true,
      data: response.data,
      statusCode: response.status,
    };
  }

  /**
   * Handle API errors and convert to standardized format
   */
  private handleError(error: unknown): TailscaleAPIResponse<never> {
    if (error instanceof AxiosError) {
      // API returned an error response
      const status = error.response?.status;
      const message =
        error.response?.data?.message ??
        error.response?.data?.error ??
        `HTTP ${status}`;

      return {
        success: false,
        error: message,
        statusCode: status,
      };
    }

    if (error instanceof Error) {
      // Network or other Error instance
      return {
        success: false,
        error:
          error.message || "Network error: Unable to connect to Tailscale API",
        statusCode: 0,
      };
    }

    // Unknown error type
    return {
      success: false,
      error: String(error) || "Unknown error occurred",
      statusCode: 0,
    };
  }

  /**
   * List all devices in the tailnet
   */
  async listDevices(): Promise<TailscaleAPIResponse<TailscaleDevice[]>> {
    try {
      const response = await this.client.get<{ devices: TailscaleDevice[] }>(
        `/tailnet/${this.tailnet}/devices`,
      );

      // Validate and parse devices
      const devices = response.data.devices
        ?.map((device) => {
          try {
            return TailscaleDeviceSchema.parse(device);
          } catch (parseError) {
            logger.warn("Failed to parse device:", {
              device,
              error: parseError,
            });
            return null;
          }
        })
        .filter(
          (d: TailscaleDevice | null): d is TailscaleDevice => d !== null,
        );

      return this.handleResponse<TailscaleDevice[]>({
        data: devices,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        config: response.config,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get a specific device by ID
   */
  async getDevice(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<TailscaleDevice>> {
    try {
      const response = await this.client.get(`/device/${deviceId}`);
      const device = TailscaleDeviceSchema.parse(response.data);

      return this.handleResponse({ ...response, data: device });
    } catch (error) {
      if (error instanceof ZodError) {
        return {
          success: false,
          error: "Invalid device data received from API",
        };
      }
      return this.handleError(error);
    }
  }

  /**
   * Authorize a device
   */
  async authorizeDevice(deviceId: string): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/device/${deviceId}/authorized`,
        {
          authorized: true,
        },
      );

      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Deauthorize a device
   */
  async deauthorizeDevice(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/device/${deviceId}/authorized`,
        {
          authorized: false,
        },
      );

      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete a device
   */
  async deleteDevice(deviceId: string): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.delete(`/device/${deviceId}`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Expire device key
   */
  async expireDeviceKey(deviceId: string): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(`/device/${deviceId}/expire`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Enable device routes
   */
  async enableDeviceRoutes(
    deviceId: string,
    routes: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(`/device/${deviceId}/routes`, {
        routes: routes,
      });

      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Disable device routes
   */
  async disableDeviceRoutes(
    deviceId: string,
    routes: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.delete(`/device/${deviceId}/routes`, {
        data: { routes: routes },
      });

      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get tailnet information
   */
  async getTailnetInfo(): Promise<TailscaleAPIResponse<TailnetInfo>> {
    try {
      const response = await this.client.get(`/tailnet/${this.tailnet}`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<TailscaleAPIResponse<{ status: string }>> {
    try {
      // TODO: Send a random request to the API to test connectivity
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/devices`,
      );
      return this.handleResponse({
        ...response,
        data: { status: "connected" },
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get version information (API version info)
   * Note: This returns API version info, not CLI version
   */
  async getVersion(): Promise<
    TailscaleAPIResponse<{ version: string; apiVersion: string }>
  > {
    // Since there's no direct version endpoint, we'll return static API version info
    return {
      success: true,
      data: {
        version: "API v2",
        apiVersion: "2.0",
      },
      statusCode: 200,
    };
  }

  /**
   * Connect to network (API equivalent of CLI 'up')
   * Note: API doesn't directly support network connection, returns informational message
   */
  async connect(): Promise<TailscaleAPIResponse<{ message: string }>> {
    return {
      success: false,
      error:
        "Network connection is only available via CLI. Use the CLI 'up' command instead.",
      statusCode: 501,
    };
  }

  /**
   * Disconnect from network (API equivalent of CLI 'down')
   * Note: API doesn't directly support network disconnection, returns informational message
   */
  async disconnect(): Promise<TailscaleAPIResponse<{ message: string }>> {
    return {
      success: false,
      error:
        "Network disconnection is only available via CLI. Use the CLI 'down' command instead.",
      statusCode: 501,
    };
  }

  /**
   * Get ACL configuration
   */
  async getACL(): Promise<TailscaleAPIResponse<string>> {
    try {
      const response = await this.client.get(`/tailnet/${this.tailnet}/acl`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Update ACL configuration
   */
  async updateACL(aclConfig: string): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/acl`,
        aclConfig,
        {
          headers: {
            "Content-Type": "application/hujson",
          },
        },
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Validate ACL configuration
   */
  async validateACL(
    aclConfig: string,
  ): Promise<TailscaleAPIResponse<ACLValidationResult>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/acl/validate`,
        aclConfig,
        {
          headers: {
            "Content-Type": "application/hujson",
          },
        },
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get DNS nameservers
   */
  async getDNSNameservers(): Promise<TailscaleAPIResponse<{ dns: string[] }>> {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/dns/nameservers`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set DNS nameservers
   */
  async setDNSNameservers(
    nameservers: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/dns/nameservers`,
        {
          dns: nameservers,
        },
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get DNS preferences
   */
  async getDNSPreferences(): Promise<
    TailscaleAPIResponse<{ magicDNS: boolean }>
  > {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/dns/preferences`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set DNS preferences
   */
  async setDNSPreferences(
    magicDNS: boolean,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/dns/preferences`,
        {
          magicDNS,
        },
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get DNS search paths
   */
  async getDNSSearchPaths(): Promise<
    TailscaleAPIResponse<{ searchPaths: string[] }>
  > {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/dns/searchpaths`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set DNS search paths
   */
  async setDNSSearchPaths(
    searchPaths: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/dns/searchpaths`,
        {
          searchPaths,
        },
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * List auth keys
   */
  async listAuthKeys(): Promise<TailscaleAPIResponse<AuthKeyList>> {
    try {
      const response = await this.client.get(`/tailnet/${this.tailnet}/keys`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Create auth key
   */
  async createAuthKey(
    keyConfig: CreateAuthKeyRequest,
  ): Promise<
    TailscaleAPIResponse<{ key: string; id: string; description?: string }>
  > {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/keys`,
        keyConfig,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete auth key
   */
  async deleteAuthKey(keyId: string): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.delete(
        `/tailnet/${this.tailnet}/keys/${keyId}`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get detailed tailnet information
   */
  async getDetailedTailnetInfo(): Promise<TailscaleAPIResponse<TailnetInfo>> {
    return this.getTailnetInfo();
  }

  /**
   * Get file sharing status for tailnet
   */
  async getFileSharingStatus(): Promise<
    TailscaleAPIResponse<{ fileSharing: boolean }>
  > {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/settings`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set file sharing status for tailnet
   */
  async setFileSharingStatus(
    enabled: boolean,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/settings`,
        {
          fileSharing: enabled,
        },
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set device as exit node
   */
  async setDeviceExitNode(
    deviceId: string,
    routes: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    return this.enableDeviceRoutes(deviceId, routes);
  }

  /**
   * Get device routes (including exit node status)
   */
  async getDeviceRoutes(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<DeviceRoutes>> {
    try {
      const response = await this.client.get(`/device/${deviceId}/routes`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get network lock status
   */
  async getNetworkLockStatus(): Promise<
    TailscaleAPIResponse<NetworkLockStatus>
  > {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/network-lock`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Enable network lock
   */
  async enableNetworkLock(): Promise<TailscaleAPIResponse<NetworkLockStatus>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/network-lock`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Disable network lock
   */
  async disableNetworkLock(): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.delete(
        `/tailnet/${this.tailnet}/network-lock`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * List webhooks
   */
  async listWebhooks(): Promise<TailscaleAPIResponse<WebhookList>> {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/webhooks`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Create webhook
   */
  async createWebhook(config: {
    endpointUrl: string;
    secret?: string;
    events: string[];
    description?: string;
  }): Promise<TailscaleAPIResponse<Webhook>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/webhooks`,
        config,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(webhookId: string): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.delete(
        `/tailnet/${this.tailnet}/webhooks/${webhookId}`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Test webhook
   */
  async testWebhook(
    webhookId: string,
  ): Promise<TailscaleAPIResponse<{ success: boolean; message?: string }>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/webhooks/${webhookId}/test`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get policy file (ACL in HuJSON format)
   */
  async getPolicyFile(): Promise<TailscaleAPIResponse<string>> {
    try {
      const response = await this.client.get(`/tailnet/${this.tailnet}/acl`, {
        headers: {
          Accept: "application/hujson",
        },
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Test ACL access
   */
  async testACLAccess(
    src: string,
    dst: string,
    proto?: string,
  ): Promise<TailscaleAPIResponse<ACLTestResult>> {
    try {
      const params = new URLSearchParams({
        src,
        dst,
        ...(proto && { proto }),
      });

      const response = await this.client.get(
        `/tailnet/${this.tailnet}/acl/test?${params}`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get device tags
   */
  async getDeviceTags(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<{ tags: string[] }>> {
    try {
      const response = await this.client.get(`/device/${deviceId}`);
      const device = response.data;
      return this.handleResponse({
        ...response,
        data: { tags: device.tags || [] },
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set device tags
   */
  async setDeviceTags(
    deviceId: string,
    tags: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(`/device/${deviceId}/tags`, {
        tags: tags,
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get SSH settings for tailnet
   */
  async getSSHSettings(): Promise<TailscaleAPIResponse<SSHSettings>> {
    try {
      const response = await this.client.get(`/tailnet/${this.tailnet}/ssh`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Update SSH settings
   */
  async updateSSHSettings(
    settings: Partial<SSHSettings>,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/ssh`,
        settings,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get network statistics
   */
  async getNetworkStats(): Promise<TailscaleAPIResponse<NetworkStats>> {
    try {
      const response = await this.client.get(`/tailnet/${this.tailnet}/stats`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get device statistics
   */
  async getDeviceStats(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<DeviceStats>> {
    try {
      const response = await this.client.get(`/device/${deviceId}/stats`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get user list
   */
  async getUsers(): Promise<TailscaleAPIResponse<UserList>> {
    try {
      const response = await this.client.get(`/tailnet/${this.tailnet}/users`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get specific user
   */
  async getUser(userId: string): Promise<TailscaleAPIResponse<User>> {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/users/${userId}`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Update user role
   */
  async updateUserRole(
    userId: string,
    role: string,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/users/${userId}`,
        {
          role: role,
        },
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(): Promise<TailscaleAPIResponse<AuditLogList>> {
    try {
      const response = await this.client.get(`/tailnet/${this.tailnet}/logs`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get device posture information
   */
  async getDevicePosture(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<DevicePosture>> {
    try {
      const response = await this.client.get(`/device/${deviceId}/posture`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set device posture policy
   */
  async setDevicePosturePolicy(
    policy: PosturePolicy,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/posture-policy`,
        policy,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }
}

// Export factory function for creating API instances
export function createTailscaleAPI(config: TailscaleConfig = {}): TailscaleAPI {
  return new TailscaleAPI(config);
}
