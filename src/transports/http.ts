import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../config.ts";
import { splitCsv } from "../config.ts";
import type { Logger } from "../logger.ts";

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function expandHostsWithPort(hosts: string[], port: number): string[] {
  const out = new Set<string>();
  for (const h of hosts) {
    out.add(h);
    if (!h.includes(":")) out.add(`${h}:${port}`);
  }
  return [...out];
}

export type ServerFactory = () => McpServer;

export async function runHttp(
  serverFactory: ServerFactory,
  cfg: Config,
  log: Logger,
): Promise<void> {
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const allowedHosts = expandHostsWithPort(
    splitCsv(cfg.HTTP_ALLOWED_HOSTS),
    cfg.HTTP_PORT,
  );
  const rawOrigins = splitCsv(cfg.HTTP_ALLOWED_ORIGINS);
  const allowedOrigins =
    rawOrigins.length > 0
      ? rawOrigins
      : splitCsv(cfg.HTTP_ALLOWED_HOSTS).flatMap((h) => [
          `https://${h}`,
          `http://${h}`,
        ]);

  function makeTransport(): StreamableHTTPServerTransport {
    return new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      enableDnsRebindingProtection: true,
      allowedHosts,
      allowedOrigins,
    });
  }

  async function handleMcp(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const sessionId = req.headers["mcp-session-id"];
    const sid = Array.isArray(sessionId) ? sessionId[0] : sessionId;

    if (req.method === "POST") {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch {
        sendJson(res, 400, { error: "invalid JSON" });
        return;
      }

      if (!sid) {
        if (!isInitializeRequest(body)) {
          sendJson(res, 400, {
            error: "mcp-session-id required for non-initialize requests",
          });
          return;
        }
        const transport = makeTransport();
        const server = serverFactory();
        await server.connect(transport);
        transport.onclose = () => {
          if (transport.sessionId) sessions.delete(transport.sessionId);
          server
            .close()
            .catch((err) => log.warn({ err }, "server close failed"));
        };
        await transport.handleRequest(req, res, body);
        if (transport.sessionId) sessions.set(transport.sessionId, transport);
        return;
      }

      const transport = sessions.get(sid);
      if (!transport) {
        sendJson(res, 400, { error: "unknown session" });
        return;
      }
      await transport.handleRequest(req, res, body);
      return;
    }

    // GET (SSE) and DELETE
    if (!sid) {
      sendJson(res, 400, { error: "mcp-session-id required" });
      return;
    }
    const transport = sessions.get(sid);
    if (!transport) {
      sendJson(res, 400, { error: "unknown session" });
      return;
    }
    await transport.handleRequest(req, res);
  }

  const httpServer = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? "/";
      const path = url.split("?")[0];

      if (path === "/health" && req.method === "GET") {
        sendJson(res, 200, { ok: true, sessions: sessions.size });
        return;
      }

      if (path === "/mcp") {
        handleMcp(req, res).catch((err) => {
          log.error({ err }, "mcp handler error");
          if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
        });
        return;
      }

      sendJson(res, 404, { error: "not found" });
    },
  );

  await new Promise<void>((resolve) => {
    httpServer.listen(cfg.HTTP_PORT, cfg.HTTP_HOST, () => {
      log.info(
        {
          host: cfg.HTTP_HOST,
          port: cfg.HTTP_PORT,
          allowedHosts,
          allowedOrigins,
        },
        "http MCP server ready",
      );
      resolve();
    });
  });

  await new Promise<never>(() => {});
}
