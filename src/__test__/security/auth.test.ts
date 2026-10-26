import { describe, expect, test } from "bun:test";
import { isAllowedHost, validateBearerToken } from "../../security/auth.js";

describe("HTTP security", () => {
  test("validates bearer token exactly", () => {
    expect(validateBearerToken("Bearer abc123", "abc123")).toBe(true);
    expect(validateBearerToken("Bearer wrong", "abc123")).toBe(false);
    expect(validateBearerToken(undefined, "abc123")).toBe(false);
  });

  test("allows localhost and tailnet hosts only", () => {
    expect(isAllowedHost("localhost:3000")).toBe(true);
    expect(isAllowedHost("127.0.0.1:3000")).toBe(true);
    expect(isAllowedHost("mcp.tailnet-name.ts.net")).toBe(true);
    expect(isAllowedHost("evil.example.com")).toBe(false);
  });

  test("allows IPv6 loopback with and without a port", () => {
    expect(isAllowedHost("[::1]:3000")).toBe(true);
    expect(isAllowedHost("[::1]")).toBe(true);
  });

  test("matches IPv6 allowlist entries with or without brackets", () => {
    expect(isAllowedHost("[fd7a::1]:3000", ["fd7a::1"])).toBe(true);
    expect(isAllowedHost("[FD7A::1]", ["[fd7a::1]"])).toBe(true);
    expect(isAllowedHost("[fd7a::2]:3000", ["fd7a::1"])).toBe(false);
  });

  test("strips brackets only from IPv6 allowlist entries", () => {
    expect(isAllowedHost("evil.example.com:3000", ["[evil.example.com]"])).toBe(
      false,
    );
  });

  test("rejects IPv6 zone ids and non-canonical loopback forms", () => {
    expect(isAllowedHost("[fe80::1%evil.ts.net]")).toBe(false);
    expect(isAllowedHost("[::1%25evil.ts.net]:3000")).toBe(false);
    expect(isAllowedHost("[fe80::1%eth0]", ["fe80::1%eth0"])).toBe(false);
    expect(isAllowedHost("[::ffff:127.0.0.1]")).toBe(false);
    expect(isAllowedHost("[0:0:0:0:0:0:0:1]")).toBe(false);
  });

  test("rejects a missing host", () => {
    expect(isAllowedHost(undefined)).toBe(false);
  });

  test("rejects malformed bracketed hosts", () => {
    expect(isAllowedHost("[::1")).toBe(false);
    expect(isAllowedHost("[::1]evil.example.com")).toBe(false);
    expect(isAllowedHost("[::1]:3000evil")).toBe(false);
    expect(isAllowedHost("[::1]:abc")).toBe(false);
    expect(isAllowedHost("[]:3000", ["[]"])).toBe(false);
    expect(isAllowedHost("[evil.ts.net]")).toBe(false);
    expect(isAllowedHost("[localhost]:3000")).toBe(false);
    expect(isAllowedHost("[evil.example.com]", ["evil.example.com"])).toBe(
      false,
    );
  });
});
