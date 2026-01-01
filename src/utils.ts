import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { isAxiosError } from "axios";
import { logger } from "./logger.js";
import { CLIError, TailscaleError } from "./types.js";

// Validation Constants
// Hostname/IP pattern: no leading/trailing dots or hyphens, no consecutive dots
export const VALID_TARGET_PATTERN =
  /^(([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*)|([0-9a-fA-F:]+))$/;

// CIDR validation
export const CIDR_PATTERN =
  /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$|^([0-9a-fA-F:]+)\/\d{1,3}$/;

export const DANGEROUS_CHARS = [
  ";",
  "&",
  "|",
  "`",
  "$",
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  "<",
  ">",
  "\\",
  "'",
  '"',
];

export const DANGEROUS_CHARS_BASIC = [
  ";",
  "&",
  "|",
  "`",
  "$",
  "(",
  ")",
  "{",
  "}",
  "<",
  ">",
  "\\",
];

// Validation Functions
export function validateTarget(target: string): void {
  if (!target || typeof target !== "string") {
    throw new Error("Invalid target specified");
  }

  for (const char of DANGEROUS_CHARS) {
    if (target.includes(char)) {
      throw new Error(`Invalid character '${char}' in target`);
    }
  }

  // Additional validation for common patterns
  if (target.includes("..") || target.startsWith("/") || target.includes("~")) {
    throw new Error("Invalid path patterns in target");
  }

  // Validate target format (hostname, IP, or Tailscale node name)
  if (!VALID_TARGET_PATTERN.test(target)) {
    throw new Error("Target contains invalid characters");
  }

  // Length validation
  if (target.length > 253) {
    // DNS hostname max length
    throw new Error("Target too long");
  }
}

export function validateStringInput(input: string, fieldName: string): void {
  if (typeof input !== "string") {
    throw new TypeError(`${fieldName} must be a string`);
  }

  // Check for dangerous characters
  for (const char of DANGEROUS_CHARS_BASIC) {
    if (input.includes(char)) {
      throw new Error(`Invalid character '${char}' in ${fieldName}`);
    }
  }

  // Length validation
  if (input.length > 1000) {
    throw new Error(`${fieldName} too long`);
  }
}

export function validateRoutes(routes: string[]): void {
  if (!Array.isArray(routes)) {
    throw new TypeError("Routes must be an array");
  }

  for (const route of routes) {
    if (typeof route !== "string") {
      throw new TypeError("Each route must be a string");
    }

    // Basic CIDR validation
    if (
      !CIDR_PATTERN.test(route) &&
      route !== "0.0.0.0/0" &&
      route !== "::/0"
    ) {
      throw new Error(`Invalid route format: ${route}`);
    }
  }
}

// Error Handling Functions
export function getErrorMessage(error: unknown): string {
  if (error instanceof TailscaleError) {
    return error.message;
  }
  if (isAxiosError(error)) {
    return error.response?.data?.error || error.message;
  }
  if (error instanceof CLIError) {
    return error.stderr || error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }

  logger.error("Unknown error:", error);
  return String(error);
}

export function returnToolSuccess(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
  };
}

export function returnToolError(error: unknown): CallToolResult {
  const errorMessage = getErrorMessage(error);

  return {
    isError: true,
    content: [{ type: "text", text: errorMessage }],
  };
}
