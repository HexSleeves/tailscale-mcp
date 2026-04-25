import * as ipaddr from "ipaddr.js";
import { ValidationError } from "../errors.ts";

export const VALID_HOSTNAME_PATTERN =
  /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*)$/;

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

export function isValidIPAddress(ip: string): boolean {
  try {
    ipaddr.parse(ip);
    return true;
  } catch {
    return false;
  }
}

export function isValidCIDR(cidr: string): boolean {
  try {
    ipaddr.parseCIDR(cidr);
    return true;
  } catch {
    return false;
  }
}

export function validateTarget(target: string): void {
  if (!target || typeof target !== "string") {
    throw new ValidationError("Invalid target specified");
  }

  for (const char of DANGEROUS_CHARS) {
    if (target.includes(char)) {
      throw new ValidationError(`Invalid character '${char}' in target`);
    }
  }

  if (target.includes("..") || target.startsWith("/") || target.includes("~")) {
    throw new ValidationError("Target contains invalid characters or format");
  }

  if (target.length > 253) {
    throw new ValidationError("Target too long");
  }

  if (isValidIPAddress(target)) {
    return;
  }

  const looksLikeIPv4 = /^\d+(\.\d+)*$/.test(target);
  if (looksLikeIPv4) {
    throw new ValidationError("Invalid IPv4 address format");
  }

  if (target.includes(":")) {
    throw new ValidationError("Invalid IPv6 address format");
  }

  if (!VALID_HOSTNAME_PATTERN.test(target)) {
    throw new ValidationError("Target must be a valid IP address or hostname");
  }
}

export function validateStringInput(input: string, fieldName: string): void {
  if (typeof input !== "string") {
    throw new ValidationError(`${fieldName} must be a string`);
  }

  for (const char of DANGEROUS_CHARS_BASIC) {
    if (input.includes(char)) {
      throw new ValidationError(`Invalid character '${char}' in ${fieldName}`);
    }
  }

  if (input.length > 1000) {
    throw new ValidationError(`${fieldName} too long`);
  }
}

export function validateRoutes(routes: string[]): void {
  if (!Array.isArray(routes)) {
    throw new ValidationError("Routes must be an array");
  }

  for (const route of routes) {
    if (typeof route !== "string") {
      throw new ValidationError("Each route must be a string");
    }

    if (!isValidCIDR(route)) {
      throw new ValidationError(`Invalid CIDR format: ${route}`);
    }
  }
}
