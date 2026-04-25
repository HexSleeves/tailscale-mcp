import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getErrorMessage } from "../errors.ts";
import {
  validateRoutes,
  validateStringInput,
  validateTarget,
} from "../lib/validate.ts";
import type { Logger } from "../logger.ts";
import type { CLIResponse, TailscaleCLIStatus } from "../types.ts";
import { TailscaleCLIStatusSchema } from "../types.ts";

const execFileAsync = promisify(execFile);

export class TailscaleCLI {
  private readonly log: Logger;
  private readonly cliPath: string;

  constructor(deps: { log: Logger; cliPath?: string }) {
    this.log = deps.log;
    this.cliPath = deps.cliPath ?? "tailscale";
  }

  private async executeCommand(args: string[]): Promise<CLIResponse<string>> {
    try {
      for (const arg of args) {
        if (typeof arg !== "string") {
          throw new TypeError("All command arguments must be strings");
        }
        if (arg.length > 1000) {
          throw new Error("Command argument too long");
        }
      }

      this.log.debug(`Executing: ${this.cliPath} ${args.join(" ")}`);

      const { stdout, stderr } = await execFileAsync(this.cliPath, args, {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 10,
        timeout: 30000,
        windowsHide: true,
        killSignal: "SIGTERM",
      });

      if (stderr?.trim()) {
        this.log.warn({ stderr }, "CLI stderr");
      }

      return {
        success: true,
        data: stdout.trim(),
        stderr: stderr?.trim(),
      };
    } catch (error: unknown) {
      this.log.error({ err: error }, "CLI command failed");

      return {
        success: false,
        error: getErrorMessage(error),
        stderr:
          error instanceof Error &&
          "stderr" in error &&
          typeof error.stderr === "string"
            ? error.stderr
            : undefined,
      };
    }
  }

  async getStatus(): Promise<CLIResponse<TailscaleCLIStatus>> {
    const result = await this.executeCommand(["status", "--json"]);

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? "Unknown error",
        stderr: result.stderr,
      };
    }

    try {
      const statusData = JSON.parse(result.data ?? "{}") as unknown;
      const validatedStatus = TailscaleCLIStatusSchema.parse(statusData);
      return { success: true, data: validatedStatus };
    } catch (error: unknown) {
      this.log.error({ err: error }, "Failed to parse status JSON");
      return {
        success: false,
        error: `Failed to parse status data: ${getErrorMessage(error)}`,
      };
    }
  }

  async listDevices(): Promise<CLIResponse<string[]>> {
    const statusResult = await this.getStatus();

    if (!statusResult.success) {
      return {
        success: false,
        error: statusResult.error ?? "Unknown error",
        stderr: statusResult.stderr,
      };
    }

    const peers = statusResult.data?.Peer
      ? Object.values(statusResult.data.Peer)
          .map((p) => p.HostName)
          .filter(
            (hostname): hostname is string => typeof hostname === "string",
          )
      : [];

    return { data: peers, success: true };
  }

  async connect(options?: {
    loginServer?: string;
    acceptRoutes?: boolean;
    acceptDns?: boolean;
    hostname?: string;
    advertiseRoutes?: string[];
    authKey?: string;
  }): Promise<CLIResponse<string>> {
    return this.up(options);
  }

  async disconnect(): Promise<CLIResponse<string>> {
    return this.down();
  }

  async getTailnetInfo(): Promise<CLIResponse<TailscaleCLIStatus>> {
    return this.getStatus();
  }

  async up(
    options: {
      loginServer?: string;
      acceptRoutes?: boolean;
      acceptDns?: boolean;
      hostname?: string;
      advertiseRoutes?: string[];
      authKey?: string;
    } = {},
  ): Promise<CLIResponse<string>> {
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

    if (options.advertiseRoutes && options.advertiseRoutes.length > 0) {
      validateRoutes(options.advertiseRoutes);
      args.push("--advertise-routes", options.advertiseRoutes.join(","));
    }

    if (options.authKey) {
      validateStringInput(options.authKey, "authKey");
      this.log.debug("Auth key passed securely via execFile");
      args.push("--authkey", options.authKey);
    }

    return await this.executeCommand(args);
  }

  async down(): Promise<CLIResponse<string>> {
    return await this.executeCommand(["down"]);
  }

  private static readonly MIN_PING_COUNT = 1;
  private static readonly MAX_PING_COUNT = 100;

  async ping(target: string, count = 4): Promise<CLIResponse<string>> {
    validateTarget(target);

    if (
      !Number.isInteger(count) ||
      count < TailscaleCLI.MIN_PING_COUNT ||
      count > TailscaleCLI.MAX_PING_COUNT
    ) {
      throw new Error(
        `Count must be an integer between ${TailscaleCLI.MIN_PING_COUNT} and ${TailscaleCLI.MAX_PING_COUNT}`,
      );
    }

    return await this.executeCommand(["ping", target, "-c", count.toString()]);
  }

  async netcheck(): Promise<CLIResponse<string>> {
    return await this.executeCommand(["netcheck"]);
  }

  async version(): Promise<CLIResponse<string>> {
    return await this.executeCommand(["version"]);
  }

  async logout(): Promise<CLIResponse<string>> {
    return await this.executeCommand(["logout"]);
  }

  async setExitNode(nodeId?: string): Promise<CLIResponse<string>> {
    const args = ["set"];

    if (nodeId) {
      validateTarget(nodeId);
      args.push("--exit-node", nodeId);
    } else {
      args.push("--exit-node=");
    }

    return await this.executeCommand(args);
  }

  async setShieldsUp(enabled: boolean): Promise<CLIResponse<string>> {
    return await this.executeCommand([
      "set",
      "--shields-up",
      enabled ? "true" : "false",
    ]);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.executeCommand(["version"]);
      return result.success;
    } catch (error) {
      this.log.error({ err: error }, "tailscale CLI not found");
      return false;
    }
  }
}
