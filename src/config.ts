import { z } from "zod";

export function splitCsv(s: string): string[] {
  return s
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

const Schema = z
  .object({
    TAILSCALE_API_KEY: z.string().startsWith("tskey-api-").optional(),
    TAILSCALE_OAUTH_CLIENT_ID: z.string().optional(),
    TAILSCALE_OAUTH_CLIENT_SECRET: z.string().optional(),
    TAILSCALE_TAILNET: z.string().min(1),
    TAILSCALE_API_BASE_URL: z.url().default("https://api.tailscale.com"),
    TAILSCALE_CLI_PATH: z.string().default("tailscale"),
    TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
    HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HTTP_HOST: z.string().default("0.0.0.0"),
    HTTP_ALLOWED_HOSTS: z.string().default("localhost,127.0.0.1,::1"),
    HTTP_ALLOWED_ORIGINS: z.string().default(""),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error"])
      .default("info"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("production"),
  })
  .refine(
    (v) =>
      v.TAILSCALE_API_KEY !== undefined ||
      (v.TAILSCALE_OAUTH_CLIENT_ID !== undefined &&
        v.TAILSCALE_OAUTH_CLIENT_SECRET !== undefined),
    {
      message:
        "Must provide either TAILSCALE_API_KEY or both TAILSCALE_OAUTH_CLIENT_ID and TAILSCALE_OAUTH_CLIENT_SECRET",
    },
  );

export type Config = z.infer<typeof Schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Schema.safeParse(env);
  if (!parsed.success) {
    process.stderr.write(`${z.prettifyError(parsed.error)}\n`);
    process.exit(1);
  }
  return parsed.data;
}
