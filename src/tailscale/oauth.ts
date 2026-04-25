import { TailscaleError } from "../errors.ts";
import type { Logger } from "../logger.ts";

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
}

export class TailscaleOAuthManager {
  private readonly config: Required<OAuthConfig>;
  private readonly log: Logger;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private readonly expiryBuffer = 60;

  constructor(config: OAuthConfig, deps: { log: Logger }) {
    this.log = deps.log;
    this.config = {
      baseUrl: "https://api.tailscale.com",
      ...config,
    };

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new TailscaleError(
        "OAuth client ID and secret are required for OAuth authentication",
      );
    }
  }

  async getAccessToken(): Promise<string> {
    if (this.isTokenValid()) {
      if (!this.accessToken) {
        throw new TailscaleError("Access token is null");
      }
      return this.accessToken;
    }

    return this.refreshToken();
  }

  private isTokenValid(): boolean {
    if (!this.accessToken || !this.tokenExpiry) {
      return false;
    }
    const now = new Date();
    const bufferMs = this.expiryBuffer * 1000;
    return this.tokenExpiry.getTime() - now.getTime() > bufferMs;
  }

  private async refreshToken(): Promise<string> {
    this.log.debug("Refreshing OAuth access token");

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/api/v2/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      this.accessToken = null;
      this.tokenExpiry = null;
      throw new TailscaleError(
        `OAuth token request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      this.accessToken = null;
      this.tokenExpiry = null;

      let errMsg = response.statusText;
      try {
        const body = (await response.json()) as Record<string, unknown>;
        if (typeof body.error_description === "string") {
          errMsg = body.error_description;
        } else if (typeof body.error === "string") {
          errMsg = body.error;
        }
      } catch {
        // ignore parse failure
      }

      this.log.error(
        { statusCode: response.status },
        "OAuth token refresh failed",
      );
      throw new TailscaleError(`OAuth authentication failed: ${errMsg}`, {
        statusCode: response.status,
      });
    }

    const data = (await response.json()) as OAuthTokenResponse;
    const { access_token, expires_in } = data;

    this.accessToken = access_token;
    this.tokenExpiry = new Date(Date.now() + expires_in * 1000);

    this.log.debug(
      `OAuth token refreshed, expires at ${this.tokenExpiry.toISOString()}`,
    );

    return access_token;
  }

  invalidateToken(): void {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.log.debug("OAuth token invalidated");
  }

  static isConfigured(): boolean {
    return !!(
      process.env.TAILSCALE_OAUTH_CLIENT_ID &&
      process.env.TAILSCALE_OAUTH_CLIENT_SECRET
    );
  }

  static fromEnvironment(deps: { log: Logger }): TailscaleOAuthManager | null {
    const clientId = process.env.TAILSCALE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.TAILSCALE_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return null;
    }

    return new TailscaleOAuthManager(
      {
        clientId,
        clientSecret,
        baseUrl: process.env.TAILSCALE_API_BASE_URL,
      },
      deps,
    );
  }
}
