import { timingSafeEqual } from "node:crypto";
import { isIPv6 } from "node:net";
import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../config/env.js";

export function validateBearerToken(
  authorization: string | undefined,
  expectedToken: string,
): boolean {
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const received = authorization.slice("Bearer ".length);
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expectedToken);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function hostnameOf(hostHeader: string): string | undefined {
  if (!hostHeader.startsWith("[")) {
    return hostHeader.split(":")[0]?.toLowerCase();
  }

  const address = /^\[([^\]]+)\](?::\d*)?$/.exec(hostHeader)?.[1];
  return address && isIPv6(address) ? address.toLowerCase() : undefined;
}

export function isAllowedHost(
  hostHeader: string | undefined,
  extraHosts: string[] = [],
): boolean {
  if (!hostHeader) {
    return false;
  }

  const host = hostnameOf(hostHeader);
  if (!host) {
    return false;
  }

  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".ts.net") ||
    extraHosts
      .map((allowed) => allowed.replace(/^\[(.*)\]$/, "$1").toLowerCase())
      .includes(host)
  );
}

export function createHttpAuthMiddleware(config: AppConfig) {
  const extraHosts = config.MCP_ALLOWED_HOSTS?.split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return (req: Request, res: Response, next: NextFunction) => {
    if (!isAllowedHost(req.headers.host, extraHosts)) {
      res.status(403).json({ error: "Forbidden host" });
      return;
    }

    if (
      !config.MCP_HTTP_BEARER_TOKEN ||
      !validateBearerToken(
        req.headers.authorization,
        config.MCP_HTTP_BEARER_TOKEN,
      )
    ) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    next();
  };
}
