import { beforeEach, describe, expect, test } from "bun:test";
import { TailscaleCLI } from "../../tailscale/tailscale-cli";

describe("TailscaleCLI Security Tests (integration)", () => {
  let cli: TailscaleCLI;

  beforeEach(() => {
    cli = new TailscaleCLI();
  });

  describe("Input Validation", () => {
    test("should reject dangerous characters in target", async () => {
      const dangerousTargets = [
        "host; rm -rf /",
        "host && echo pwned",
        "host | cat /etc/passwd",
        "host`whoami`",
        "host$(id)",
        "host{test}",
        "host[test]",
        "host<test>",
        "host\\test",
        "host'test'",
        'host"test"',
      ];

      for (const target of dangerousTargets) {
        expect(() => cli.ping(target)).toThrow(/Invalid character/);
      }
    });

    test("should reject path traversal attempts", async () => {
      const pathTraversalTargets = [
        "../etc/passwd",
        "/etc/passwd",
        "~/secrets",
        "host/../etc",
      ];

      for (const target of pathTraversalTargets) {
        expect(() => cli.ping(target)).toThrow(/invalid/i);
      }
    });

    test("should reject overly long targets", async () => {
      const longTarget = "a".repeat(300);
      expect(() => cli.ping(longTarget)).toThrow(/too long/);
    });

    test("should accept valid targets", async () => {
      const validTargets = [
        "hostname",
        "host.example.com",
        "192.168.1.1",
        "node-123",
        "test-server.local",
      ];

      // Note: These will fail at execution but should pass validation
      for (const target of validTargets) {
        // We expect these to fail at execution, not validation
        const result = await cli.ping(target, 1);
        expect(result.success).toBe(false);
        // Ensure the error is not from our validation
        expect(result.error).not.toMatch(/Invalid/);
        // Optionally, check for specific execution errors like "command not found"
        // or "network unreachable" to ensure it's an execution error
      }
    });

    test("should validate ping count parameter", async () => {
      expect(() => cli.ping("valid-host", 0)).toThrow(
        /Count must be an integer between 1 and 100/,
      );
      expect(() => cli.ping("valid-host", 101)).toThrow(
        /Count must be an integer between 1 and 100/,
      );
      expect(() => cli.ping("valid-host", -1)).toThrow(
        /Count must be an integer between 1 and 100/,
      );
      expect(() => cli.ping("valid-host", 1.5)).toThrow(
        /Count must be an integer between 1 and 100/,
      );
    });
  });

  describe("String Input Validation", () => {
    test("should validate hostname in up() options", async () => {
      const dangerousHostnames = [
        "host; rm -rf /",
        "host && echo pwned",
        "host | cat /etc/passwd",
        "host`whoami`",
      ];

      for (const hostname of dangerousHostnames) {
        expect(() => cli.up({ hostname })).toThrow(/Invalid character/);
      }
    });

    test("should validate loginServer in up() options", async () => {
      const dangerousServers = [
        "server; rm -rf /",
        "server && echo pwned",
        "server | cat /etc/passwd",
      ];

      for (const loginServer of dangerousServers) {
        expect(() => cli.up({ loginServer })).toThrow(/Invalid character/);
      }
    });

    test("should validate authKey in up() options", async () => {
      const dangerousKeys = [
        "key; rm -rf /",
        "key && echo pwned",
        "key | cat /etc/passwd",
      ];

      for (const authKey of dangerousKeys) {
        expect(() => cli.up({ authKey })).toThrow(/Invalid character/);
      }
    });
  });

  describe("Route Validation", () => {
    test("should validate CIDR routes", async () => {
      // Routes that should be caught by our validation using ipaddr.js
      const ourValidationRoutes = [
        ["invalid-route"],
        ["192.168.1.1/"], // Missing prefix length
        ["192.168.1.1/abc"], // Non-numeric prefix
        ["192.168.1.1/33"], // Invalid prefix (> 32 for IPv4)
        ["256.256.256.256/24"], // Invalid IP (octets > 255)
        ["999.999.999.999/32"], // Invalid IP (octets > 255)
        ["2001:db8::/129"], // Invalid prefix (> 128 for IPv6)
      ];

      for (const advertiseRoutes of ourValidationRoutes) {
        expect(() => cli.up({ advertiseRoutes })).toThrow(
          /Invalid CIDR format:/,
        );
      }
    });

    test.each([
      ["192.168.1.0/24"],
      ["10.0.0.0/8"],
      ["0.0.0.0/0"],
      ["::/0"],
      ["2001:db8::/32"],
    ])("should validate CIDR route %s", async (route) => {
      // Should pass validation - execution result may vary based on Tailscale state
      const result = await cli.up({ advertiseRoutes: [route] });

      // The important thing is that our validation doesn't reject valid routes
      // The actual execution may succeed or fail depending on Tailscale configuration
      if (!result.success) {
        // If it fails, it should not be due to our validation
        expect(result.error).not.toMatch(/Invalid route format/);

        // Common acceptable errors include authentication issues or network state
        const acceptableErrors = [
          /not logged in/i,
          /not connected/i,
          /authentication required/i,
          /operation not permitted/i,
          /changing settings via 'tailscale up' requires mentioning all/i,
          /advertised without its IPv6 counterpart/i,
          /advertised without its IPv4 counterpart/i,
        ];

        const hasAcceptableError = acceptableErrors.some((pattern) =>
          pattern.test(result.error || ""),
        );

        expect(hasAcceptableError || result.success).toBeTruthy();
      }
      // If it succeeds, that's also fine - it means Tailscale accepted the route
    });
  });

  describe("Exit Node Validation", () => {
    test("should validate exit node ID", async () => {
      const dangerousNodeIds = [
        "node; rm -rf /",
        "node && echo pwned",
        "node | cat /etc/passwd",
      ];

      for (const nodeId of dangerousNodeIds) {
        expect(() => cli.setExitNode(nodeId)).toThrow(/Invalid character/);
      }
    });
  });
});
