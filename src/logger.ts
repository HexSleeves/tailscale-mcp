import pino from "pino";
import type { Config } from "./config.ts";

export type Logger = pino.Logger;

export function createLogger(cfg: Config): pino.Logger {
  const redact: pino.redactOptions = {
    paths: [
      "apiKey",
      "authKey",
      "TAILSCALE_API_KEY",
      "TAILSCALE_OAUTH_CLIENT_SECRET",
      "headers.authorization",
      "req.headers.authorization",
      "args.authKey",
    ],
    censor: "[REDACTED]",
  };

  const base = { svc: "tailscale-mcp" };

  if (cfg.NODE_ENV === "development") {
    try {
      return pino(
        { level: cfg.LOG_LEVEL, base, redact },
        pino.transport({
          target: "pino-pretty",
          options: { destination: 2, colorize: true },
        }),
      );
    } catch {
      // pino-pretty not installed; fall through to plain destination
    }
  }

  return pino(
    { level: cfg.LOG_LEVEL, base, redact },
    pino.destination({ dest: 2, sync: false }),
  );
}
