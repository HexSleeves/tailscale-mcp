import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  getErrorMessage,
  validateRoutes,
  validateStringInput,
  validateTarget,
} from "../utils.js";
import { logger } from "../logger.js";
import {
  type CLIResponse,
  type TailscaleCLIStatus,
  TailscaleCLIStatusSchema,
} from "../types.js";

const execFileAsync = promisify(execFile);

export class TailscaleCLI {
  private readonly cliPath: string;

  constructor(cliPath = "tailscale") {
    this.cliPath = cliPath;
  }

  /**
   * Execute a Tailscale CLI command
   */
  private async executeCommand(args: string[]): Promise<CLIResponse<string>> {
    try {
      // Validate all arguments
      for (const arg of args) {
        if (typeof arg !== "string") {
          throw new TypeError("All command arguments must be strings");
        }

        // Basic validation for each argument
        if (arg.length > 1000) {
          throw new Error("Command argument too long");
        }
      }

      logger.debug(`Executing: ${this.cliPath} ${args.join(" ")}`);

      const { stdout, stderr } = await execFileAsync(this.cliPath, args, {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer limit
        timeout: 30000, // 30 second timeout
        windowsHide: true, // Hide window on Windows
        killSignal: "SIGTERM", // Graceful termination signal
      });

      if (stderr?.trim()) {
        logger.warn("CLI stderr:", stderr);
      }

      return {
        success: true,
        data: stdout.trim(),
        stderr: stderr?.trim(),
      };
    } catch (error: unknown) {
      logger.error("CLI command failed:", error);

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

  /**
   * Get Tailscale status
   */
  async getStatus(): Promise<CLIResponse<TailscaleCLIStatus>> {
    const result = await this.executeCommand(["status", "--json"]);

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Unknown error",
        stderr: result.stderr,
      };
    }

    try {
      const statusData = JSON.parse(result.data || "{}");
      const validatedStatus = TailscaleCLIStatusSchema.parse(statusData);

      return {
        success: true,
        data: validatedStatus,
      };
    } catch (error: unknown) {
      logger.error("Failed to parse status JSON:", error);
      return {
        success: false,
        error: `Failed to parse status data: ${getErrorMessage(error)}`,
      };
    }
  }

  /**
   * Get list of devices (peers)
   */
  async listDevices(): Promise<CLIResponse<string[]>> {
    const statusResult = await this.getStatus();

    if (!statusResult.success) {
      return {
        success: false,
        error: statusResult.error || "Unknown error",
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

    return {
      data: peers,
      success: true,
    };
  }

  /**
   * Connect to network (alias for up)
   */
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

  /**
   * Disconnect from network (alias for down)
   */
  async disconnect(): Promise<CLIResponse<string>> {
    return this.down();
  }

  /**
   * Get tailnet info (alias for getStatus for API parity)
   */
  async getTailnetInfo(): Promise<CLIResponse<TailscaleCLIStatus>> {
    return this.getStatus();
  }

  /**
   * Connect to Tailscale network
   */
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
      // Pass auth key directly as argument since execFile handles it securely
      // The auth key won't be exposed in shell command history
      // Changed from info to debug
      logger.debug("Auth key passed securely via execFile");
      args.push("--authkey", options.authKey);
    }

    return await this.executeCommand(args);
  }

  /**
   * Disconnect from Tailscale network
   */
  async down(): Promise<CLIResponse<string>> {
    return await this.executeCommand(["down"]);
  }

  /**
   * Ping a peer
   */
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

  /**
   * Get network check information
   */
  async netcheck(): Promise<CLIResponse<string>> {
    return await this.executeCommand(["netcheck"]);
  }

  /**
   * Get version information
   */
  async version(): Promise<CLIResponse<string>> {
    return await this.executeCommand(["version"]);
  }

  /**
   * Logout from Tailscale
   */
  async logout(): Promise<CLIResponse<string>> {
    return await this.executeCommand(["logout"]);
  }

  /**
   * Set exit node
   */
  async setExitNode(nodeId?: string): Promise<CLIResponse<string>> {
    const args = ["set"];

    if (nodeId) {
      validateTarget(nodeId);
      args.push("--exit-node", nodeId);
    } else {
      args.push("--exit-node="); // Clear exit node with empty value
    }

    return await this.executeCommand(args);
  }

  /**
   * Enable/disable shields up mode
   */
  async setShieldsUp(enabled: boolean): Promise<CLIResponse<string>> {
    return await this.executeCommand([
      "set",
      "--shields-up",
      enabled ? "true" : "false",
    ]);
  }

  /**
   * Check if CLI is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.executeCommand(["version"]);
      return result.success;
    } catch (error) {
      logger.error("tailscale CLI not found:", error);
      return false;
    }
  }
}

// Export default instance
export const tailscaleCLI = new TailscaleCLI();
