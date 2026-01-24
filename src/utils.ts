import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { isAxiosError } from "axios";
import * as ipaddr from "ipaddr.js";
import { logger } from "./logger.js";
import { CLIError, TailscaleError } from "./types.js";

// Validation Constants
// Hostname pattern: valid DNS hostname format
export const VALID_HOSTNAME_PATTERN =
  /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*)$/;

// Legacy pattern kept for backward compatibility - prefer isValidIPAddress for IP validation
export const VALID_TARGET_PATTERN =
  /^(([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*)|([0-9a-fA-F:]+))$/;

// Legacy CIDR pattern - prefer isValidCIDR for proper validation
// Note: This pattern is insufficient for security-critical validation
export const CIDR_PATTERN =
  /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$|^([0-9a-fA-F:]+)\/\d{1,3}$/;

/**
 * Validates an IP address (IPv4 or IPv6) using ipaddr.js
 * @param ip - The IP address string to validate
 * @returns true if valid, false otherwise
 */
export function isValidIPAddress(ip: string): boolean {
  try {
    ipaddr.parse(ip);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a CIDR notation string (e.g., "10.0.0.0/8" or "2001:db8::/32")
 * Uses ipaddr.js for proper validation including:
 * - IPv4 octets must be 0-255
 * - IPv6 segments must be valid hex
 * - IPv4 prefix length must be 0-32
 * - IPv6 prefix length must be 0-128
 *
 * @param cidr - The CIDR string to validate
 * @returns true if valid, false otherwise
 */
export function isValidCIDR(cidr: string): boolean {
  try {
    // ipaddr.parseCIDR validates the IP and prefix length, throwing on invalid input
    ipaddr.parseCIDR(cidr);
    return true;
  } catch {
    return false;
  }
}

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
    throw new Error("Target contains invalid characters or format");
  }

  // Length validation
  if (target.length > 253) {
    // DNS hostname max length
    throw new Error("Target too long");
  }

  // Validate target format: must be a valid IP address or hostname
  // First try to parse as IP address using ipaddr.js for proper validation
  if (isValidIPAddress(target)) {
    return; // Valid IP address
  }

  // Check if it looks like an IPv4 address (digits and dots only)
  // If so, it must be validated as IP, not hostname
  const looksLikeIPv4 = /^\d+(\.\d+)*$/.test(target);
  if (looksLikeIPv4) {
    throw new Error("Invalid IPv4 address format");
  }

  // Check if it looks like an IPv6 address (contains colons)
  // If so, it must be validated as IP, not hostname
  if (target.includes(":")) {
    throw new Error("Invalid IPv6 address format");
  }

  // If not an IP, validate as hostname
  if (!VALID_HOSTNAME_PATTERN.test(target)) {
    throw new Error("Target must be a valid IP address or hostname");
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

    // Proper CIDR validation using ipaddr.js
    // This validates:
    // - IPv4 octets are 0-255
    // - IPv6 segments are valid hex
    // - IPv4 prefix length is 0-32
    // - IPv6 prefix length is 0-128
    if (!isValidCIDR(route)) {
      throw new Error(`Invalid CIDR format: ${route}`);
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
