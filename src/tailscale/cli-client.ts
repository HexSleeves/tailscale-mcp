import { spawn } from "node:child_process";
import type { AppLogger } from "../observability/logger.js";
import { redact } from "../observability/redaction.js";
import {
  validateRoutes,
  validateStringInput,
  validateTarget,
} from "../utils.js";

export interface CliResult<T = string> {
  success: boolean;
  data?: T;
  error?: string;
  stderr?: string;
}

export class TailscaleCliClient {
  constructor(
    private readonly cliPath: string,
    private readonly logger: AppLogger,
  ) {}

  async isAvailable(): Promise<boolean> {
    const result = await this.execute(["version"]);
    return result.success;
  }

  async status(): Promise<CliResult<unknown>> {
    const result = await this.execute(["status", "--json"]);
    if (!result.success) {
      return result;
    }

    try {
      return {
        success: true,
        data: JSON.parse(result.data ?? "{}"),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async listDevices(): Promise<CliResult<unknown[]>> {
    const status = await this.status();
    if (!status.success) {
      return status as CliResult<unknown[]>;
    }

    const record = status.data as Record<string, unknown>;
    const peers =
      record.Peer && typeof record.Peer === "object"
        ? Object.values(record.Peer)
        : [];

    return { success: true, data: peers };
  }

  async connect(options: {
    loginServer?: string;
    acceptRoutes?: boolean;
    acceptDns?: boolean;
    hostname?: string;
    advertiseRoutes?: string[];
    authKey?: string;
  }): Promise<CliResult> {
    const args = ["up"];

    if (options.loginServer) {
      validateStringInput(options.loginServer, "loginServer");
      args.push("--login-server", options.loginServer);
    }
    if (options.acceptRoutes) {
      args.push("--accept-routes");
    }
    if (options.acceptDns) {
      args.push("--accept-dns");
    }
    if (options.hostname) {
      validateStringInput(options.hostname, "hostname");
      args.push("--hostname", options.hostname);
    }
    if (options.advertiseRoutes?.length) {
      validateRoutes(options.advertiseRoutes);
      args.push("--advertise-routes", options.advertiseRoutes.join(","));
    }
    if (options.authKey) {
      validateStringInput(options.authKey, "authKey");
      args.push("--authkey", options.authKey);
    }

    return this.execute(args);
  }

  async disconnect(): Promise<CliResult> {
    return this.execute(["down"]);
  }

  async ping(target: string, count: number): Promise<CliResult> {
    validateTarget(target);
    return this.execute(["ping", `--c=${count}`, "--timeout=1s", target]);
  }

  async version(): Promise<CliResult> {
    return this.execute(["version"]);
  }

  async setExitNode(nodeId?: string): Promise<CliResult> {
    if (nodeId) {
      validateTarget(nodeId);
      return this.execute(["set", "--exit-node", nodeId]);
    }
    return this.execute(["set", "--exit-node="]);
  }

  private async execute(args: string[]): Promise<CliResult> {
    this.logger.debug(
      "Executing Tailscale CLI",
      redact([this.cliPath, ...args]),
    );

    const { stdout, stderr, exitCode } = await new Promise<{
      stdout: string;
      stderr: string;
      exitCode: number;
    }>((resolve, reject) => {
      const proc = spawn(this.cliPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      });

      let out = "";
      let err = "";
      proc.stdout.on("data", (chunk: Buffer) => {
        out += chunk.toString("utf8");
      });
      proc.stderr.on("data", (chunk: Buffer) => {
        err += chunk.toString("utf8");
      });
      proc.on("error", reject);
      proc.on("close", (code) => {
        resolve({ stdout: out, stderr: err, exitCode: code ?? -1 });
      });
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return {
        stdout: "",
        stderr: `Failed to execute ${this.cliPath}: ${message}`,
        exitCode: -1,
      };
    });

    // CLI stderr may echo arguments (e.g. auth keys); redact before exposing
    const safeStderr = redact(stderr.trim());

    if (exitCode !== 0) {
      return {
        success: false,
        error: safeStderr || `tailscale exited with code ${exitCode}`,
        stderr: safeStderr,
      };
    }

    return {
      success: true,
      data: stdout.trim(),
      stderr: safeStderr || undefined,
    };
  }
}
