#!/usr/bin/env bun
import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { createMcpServer } from "./server.ts";
import { createTailscaleAPI } from "./tailscale/tailscale-api.ts";
import { TailscaleCLI } from "./tailscale/tailscale-cli.ts";
import { runHttp } from "./transports/http.ts";
import { runStdio } from "./transports/stdio.ts";

async function main() {
  const cfg = loadConfig();
  const log = createLogger(cfg);

  const api = createTailscaleAPI({ log });
  const cli = new TailscaleCLI({ log, cliPath: cfg.TAILSCALE_CLI_PATH });

  const ctx = { log, api, cli };

  process.on("SIGINT", () => {
    log.info("SIGINT");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    log.info("SIGTERM");
    process.exit(0);
  });
  process.on("unhandledRejection", (err) => {
    log.error({ err }, "unhandledRejection");
    process.exit(1);
  });

  if (cfg.TRANSPORT === "stdio") await runStdio(createMcpServer(ctx), log);
  else await runHttp(() => createMcpServer(ctx), cfg, log);
}

main().catch((err) => {
  process.stderr.write(
    `fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});
