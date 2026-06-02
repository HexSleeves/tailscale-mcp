import net from "node:net";
import { z } from "zod";

export const ToolRiskSchema = z.enum(["read", "write", "admin"]);
export type ToolRisk = z.infer<typeof ToolRiskSchema>;

const EnvSchema = z
  .object({
    MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
    MCP_HTTP_BIND_HOST: z.string().default("127.0.0.1"),
    MCP_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    MCP_HTTP_BEARER_TOKEN: z.string().min(32).optional(),
    MCP_ALLOWED_HOSTS: z.string().optional(),
    TAILSCALE_TAILNET: z.string().default("-"),
    TAILSCALE_API_BASE_URL: z
      .string()
      .url()
      .refine(
        (value) => {
          const url = new URL(value);
          if (url.protocol === "https:") {
            return true;
          }
          if (url.protocol !== "http:") {
            return false;
          }
          // WHATWG URL keeps brackets around IPv6 hosts (e.g. "[::1]").
          const host = url.hostname.replace(/^\[|\]$/g, "");
          // Permit plain HTTP only for loopback (local dev / mock servers);
          // anything else would transmit the API key / OAuth secret in cleartext.
          return (
            host === "localhost" ||
            (net.isIPv4(host) && host === "127.0.0.1") ||
            (net.isIPv6(host) && host === "::1")
          );
        },
        {
          message:
            "TAILSCALE_API_BASE_URL must use https (http allowed only for localhost)",
        },
      )
      .default("https://api.tailscale.com"),
    TAILSCALE_API_KEY: z.string().optional(),
    TAILSCALE_OAUTH_CLIENT_ID: z.string().optional(),
    TAILSCALE_OAUTH_CLIENT_SECRET: z.string().optional(),
    TAILSCALE_CLI_PATH: z.string().default("tailscale"),
    TAILSCALE_ALLOWED_TOOL_RISK: ToolRiskSchema.default("read"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    MCP_SERVER_LOG_FILE: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const hasOauth =
      Boolean(env.TAILSCALE_OAUTH_CLIENT_ID) &&
      Boolean(env.TAILSCALE_OAUTH_CLIENT_SECRET);
    const hasPartialOauth =
      Boolean(env.TAILSCALE_OAUTH_CLIENT_ID) !==
      Boolean(env.TAILSCALE_OAUTH_CLIENT_SECRET);
    const hasApiKey = Boolean(env.TAILSCALE_API_KEY);

    if (hasPartialOauth) {
      ctx.addIssue({
        code: "custom",
        path: ["TAILSCALE_OAUTH_CLIENT_ID"],
        message:
          "Set both TAILSCALE_OAUTH_CLIENT_ID and TAILSCALE_OAUTH_CLIENT_SECRET",
      });
    }

    if (!hasOauth && !hasApiKey) {
      ctx.addIssue({
        code: "custom",
        path: ["TAILSCALE_OAUTH_CLIENT_ID"],
        message: "Set OAuth credentials or TAILSCALE_API_KEY",
      });
    }

    if (env.MCP_TRANSPORT === "http" && !env.MCP_HTTP_BEARER_TOKEN) {
      ctx.addIssue({
        code: "custom",
        path: ["MCP_HTTP_BEARER_TOKEN"],
        message: "HTTP transport requires MCP_HTTP_BEARER_TOKEN",
      });
    }
  });

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  overrides: Partial<AppConfig> = {},
): AppConfig {
  return EnvSchema.parse({ ...env, ...overrides });
}

export function parseCliOverrides(
  argv = process.argv.slice(2),
): Partial<AppConfig> {
  const overrides: Partial<AppConfig> = {};

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--http") {
      overrides.MCP_TRANSPORT = "http";
    } else if (arg === "--stdio") {
      overrides.MCP_TRANSPORT = "stdio";
    } else if (arg === "--port") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--port requires a value");
      }
      overrides.MCP_HTTP_PORT = Number(value);
      index++;
    } else if (arg === "--host") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--host requires a value");
      }
      overrides.MCP_HTTP_BIND_HOST = value;
      index++;
    } else if (arg === "--help" || arg === "-h") {
      process.stderr.write(`Tailscale MCP Server

Usage:
  tailscale-mcp-server [--stdio]
  tailscale-mcp-server --http --port 3000 --host 127.0.0.1

Required auth:
  TAILSCALE_OAUTH_CLIENT_ID and TAILSCALE_OAUTH_CLIENT_SECRET
  or TAILSCALE_API_KEY

HTTP mode also requires:
  MCP_HTTP_BEARER_TOKEN
`);
      process.exit(0);
    }
  }

  return overrides;
}
