import { describe, expect, it } from "bun:test";
import { ValidationError } from "../../src/errors.ts";
import {
  isValidCIDR,
  isValidIPAddress,
  validateRoutes,
  validateStringInput,
  validateTarget,
} from "../../src/lib/validate.ts";

describe("isValidIPAddress", () => {
  it.each([
    ["10.0.0.1", true],
    ["255.255.255.255", true],
    ["::1", true],
    ["2001:db8::1", true],
    ["999.0.0.1", false],
    ["not-an-ip", false],
    ["", false],
  ])("%s -> %s", (input, expected) => {
    expect(isValidIPAddress(input)).toBe(expected);
  });
});

describe("isValidCIDR", () => {
  it("accepts standard IPv4 CIDR", () => {
    expect(isValidCIDR("10.0.0.0/8")).toBe(true);
    expect(isValidCIDR("192.168.1.0/24")).toBe(true);
  });

  it("accepts IPv6 CIDR", () => {
    expect(isValidCIDR("2001:db8::/32")).toBe(true);
  });

  it("rejects malformed CIDR", () => {
    expect(isValidCIDR("10.0.0.0")).toBe(false);
    expect(isValidCIDR("10.0.0.0/33")).toBe(false);
    expect(isValidCIDR("nope/8")).toBe(false);
  });
});

describe("validateRoutes", () => {
  it("accepts valid CIDRs", () => {
    expect(() =>
      validateRoutes(["10.0.0.0/8", "192.168.0.0/16"]),
    ).not.toThrow();
  });

  it("throws on bad CIDR", () => {
    expect(() => validateRoutes(["10.0.0.0/8", "junk"])).toThrow(
      ValidationError,
    );
  });
});

describe("validateTarget", () => {
  it("accepts hostnames and IPs", () => {
    expect(() => validateTarget("example.com")).not.toThrow();
    expect(() => validateTarget("10.0.0.1")).not.toThrow();
  });

  it("rejects shell metachars", () => {
    expect(() => validateTarget("foo;rm -rf")).toThrow(ValidationError);
    expect(() => validateTarget("foo`whoami`")).toThrow(ValidationError);
    expect(() => validateTarget("foo|cat")).toThrow(ValidationError);
  });

  it("rejects path traversal", () => {
    expect(() => validateTarget("../etc/passwd")).toThrow(ValidationError);
  });

  it("rejects malformed IPv4", () => {
    expect(() => validateTarget("999.0.0.1")).toThrow(ValidationError);
  });
});

describe("validateStringInput", () => {
  it("rejects shell metachars and >1000 chars", () => {
    expect(() => validateStringInput("ok-name", "field")).not.toThrow();
    expect(() => validateStringInput("a;b", "field")).toThrow(ValidationError);
    expect(() => validateStringInput("x".repeat(1001), "field")).toThrow(
      ValidationError,
    );
  });
});
