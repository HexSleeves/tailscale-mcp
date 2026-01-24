import { describe, expect, it } from "bun:test";
import {
  isValidCIDR,
  isValidIPAddress,
  validateRoutes,
  validateTarget,
} from "../../utils.js";

describe("IP and CIDR Validation", () => {
  describe("isValidIPAddress", () => {
    describe("valid IPv4 addresses", () => {
      it("should accept standard IPv4", () => {
        expect(isValidIPAddress("192.168.1.1")).toBe(true);
        expect(isValidIPAddress("10.0.0.1")).toBe(true);
        expect(isValidIPAddress("172.16.0.1")).toBe(true);
        expect(isValidIPAddress("0.0.0.0")).toBe(true);
        expect(isValidIPAddress("255.255.255.255")).toBe(true);
      });

      it("should accept edge case IPv4 values", () => {
        expect(isValidIPAddress("0.0.0.0")).toBe(true);
        expect(isValidIPAddress("127.0.0.1")).toBe(true);
        expect(isValidIPAddress("1.1.1.1")).toBe(true);
      });
    });

    describe("invalid IPv4 addresses", () => {
      it("should reject octets > 255", () => {
        expect(isValidIPAddress("256.0.0.1")).toBe(false);
        expect(isValidIPAddress("192.168.256.1")).toBe(false);
        expect(isValidIPAddress("999.999.999.999")).toBe(false);
      });

      it("should reject malformed IPv4", () => {
        // Note: ipaddr.js may parse some short forms as valid IPv6
        // The critical validation is that octets > 255 are rejected
        expect(isValidIPAddress("192.168.1.1.1")).toBe(false);
        expect(isValidIPAddress("192.168.1.")).toBe(false);
        expect(isValidIPAddress(".192.168.1.1")).toBe(false);
      });
    });

    describe("valid IPv6 addresses", () => {
      it("should accept standard IPv6", () => {
        expect(isValidIPAddress("2001:db8::1")).toBe(true);
        expect(isValidIPAddress("::1")).toBe(true);
        expect(isValidIPAddress("::")).toBe(true);
        expect(isValidIPAddress("fe80::1")).toBe(true);
        expect(
          isValidIPAddress("2001:0db8:85a3:0000:0000:8a2e:0370:7334"),
        ).toBe(true);
      });

      it("should accept compressed IPv6", () => {
        expect(isValidIPAddress("2001:db8::")).toBe(true);
        expect(isValidIPAddress("::ffff:192.168.1.1")).toBe(true);
      });
    });

    describe("invalid IPv6 addresses", () => {
      it("should reject malformed IPv6", () => {
        expect(isValidIPAddress("2001:db8:::1")).toBe(false);
        expect(
          isValidIPAddress("2001:db8:85a3:0000:0000:8a2e:0370:7334:extra"),
        ).toBe(false);
        expect(isValidIPAddress("gggg::1")).toBe(false);
      });
    });

    describe("non-IP inputs", () => {
      it("should reject non-IP strings", () => {
        expect(isValidIPAddress("example.com")).toBe(false);
        expect(isValidIPAddress("localhost")).toBe(false);
        expect(isValidIPAddress("")).toBe(false);
        expect(isValidIPAddress("not-an-ip")).toBe(false);
      });
    });
  });

  describe("isValidCIDR", () => {
    describe("valid IPv4 CIDR", () => {
      it("should accept valid IPv4 CIDR notation", () => {
        expect(isValidCIDR("10.0.0.0/8")).toBe(true);
        expect(isValidCIDR("192.168.0.0/16")).toBe(true);
        expect(isValidCIDR("192.168.1.0/24")).toBe(true);
        expect(isValidCIDR("192.168.1.1/32")).toBe(true);
        expect(isValidCIDR("0.0.0.0/0")).toBe(true);
      });

      it("should accept edge case prefix lengths", () => {
        expect(isValidCIDR("10.0.0.0/0")).toBe(true);
        expect(isValidCIDR("10.0.0.0/32")).toBe(true);
      });
    });

    describe("invalid IPv4 CIDR", () => {
      it("should reject invalid IPv4 octets (> 255)", () => {
        expect(isValidCIDR("256.0.0.0/8")).toBe(false);
        expect(isValidCIDR("999.999.999.999/32")).toBe(false);
        expect(isValidCIDR("192.168.300.0/24")).toBe(false);
      });

      it("should reject invalid IPv4 prefix lengths (> 32)", () => {
        expect(isValidCIDR("10.0.0.0/33")).toBe(false);
        expect(isValidCIDR("10.0.0.0/64")).toBe(false);
        expect(isValidCIDR("10.0.0.0/99")).toBe(false);
      });

      it("should reject malformed IPv4 CIDR", () => {
        // Note: ipaddr.js may parse some short forms permissively
        // The critical validation is octets > 255 and prefix > 32 are rejected
        expect(isValidCIDR("10.0.0.0.0/8")).toBe(false);
        expect(isValidCIDR("10.0.0.0/")).toBe(false);
        expect(isValidCIDR("/8")).toBe(false);
      });
    });

    describe("valid IPv6 CIDR", () => {
      it("should accept valid IPv6 CIDR notation", () => {
        expect(isValidCIDR("2001:db8::/32")).toBe(true);
        expect(isValidCIDR("::/0")).toBe(true);
        expect(isValidCIDR("fe80::/10")).toBe(true);
        expect(isValidCIDR("::1/128")).toBe(true);
      });

      it("should accept edge case prefix lengths", () => {
        expect(isValidCIDR("::/0")).toBe(true);
        expect(isValidCIDR("::1/128")).toBe(true);
      });
    });

    describe("invalid IPv6 CIDR", () => {
      it("should reject invalid IPv6 prefix lengths (> 128)", () => {
        expect(isValidCIDR("2001:db8::/129")).toBe(false);
        expect(isValidCIDR("2001:db8::/256")).toBe(false);
        expect(isValidCIDR("::/999")).toBe(false);
      });

      it("should reject malformed IPv6 CIDR", () => {
        expect(isValidCIDR("2001:db8:::1/64")).toBe(false);
        expect(isValidCIDR("gggg::/64")).toBe(false);
      });
    });

    describe("non-CIDR inputs", () => {
      it("should reject non-CIDR strings", () => {
        expect(isValidCIDR("example.com/24")).toBe(false);
        expect(isValidCIDR("192.168.1.1")).toBe(false); // IP without prefix
        expect(isValidCIDR("")).toBe(false);
        expect(isValidCIDR("not-a-cidr")).toBe(false);
      });
    });
  });

  describe("validateRoutes", () => {
    it("should accept valid IPv4 routes", () => {
      expect(() => validateRoutes(["10.0.0.0/8"])).not.toThrow();
      expect(() =>
        validateRoutes(["192.168.0.0/16", "172.16.0.0/12"]),
      ).not.toThrow();
      expect(() => validateRoutes(["0.0.0.0/0"])).not.toThrow();
    });

    it("should accept valid IPv6 routes", () => {
      expect(() => validateRoutes(["::/0"])).not.toThrow();
      expect(() => validateRoutes(["2001:db8::/32"])).not.toThrow();
    });

    it("should accept mixed IPv4 and IPv6 routes", () => {
      expect(() =>
        validateRoutes(["10.0.0.0/8", "2001:db8::/32"]),
      ).not.toThrow();
    });

    it("should reject invalid CIDR (octets > 255)", () => {
      expect(() => validateRoutes(["999.999.999.999/32"])).toThrow(
        /Invalid CIDR format/,
      );
    });

    it("should reject invalid prefix lengths", () => {
      expect(() => validateRoutes(["10.0.0.0/33"])).toThrow(
        /Invalid CIDR format/,
      );
      expect(() => validateRoutes(["2001:db8::/129"])).toThrow(
        /Invalid CIDR format/,
      );
    });

    it("should reject non-array input", () => {
      // @ts-expect-error Testing invalid input
      expect(() => validateRoutes("10.0.0.0/8")).toThrow(/must be an array/);
    });

    it("should reject non-string route entries", () => {
      // @ts-expect-error Testing invalid input
      expect(() => validateRoutes([123])).toThrow(/must be a string/);
    });
  });

  describe("validateTarget", () => {
    it("should accept valid IPv4 addresses", () => {
      expect(() => validateTarget("192.168.1.1")).not.toThrow();
      expect(() => validateTarget("10.0.0.1")).not.toThrow();
    });

    it("should reject invalid IPv4 addresses", () => {
      expect(() => validateTarget("999.999.999.999")).toThrow();
    });

    it("should accept valid IPv6 addresses", () => {
      expect(() => validateTarget("2001:db8::1")).not.toThrow();
      expect(() => validateTarget("::1")).not.toThrow();
    });

    it("should accept valid hostnames", () => {
      expect(() => validateTarget("example.com")).not.toThrow();
      expect(() => validateTarget("my-server")).not.toThrow();
      expect(() => validateTarget("server123")).not.toThrow();
    });

    it("should reject dangerous characters", () => {
      expect(() => validateTarget("host;rm -rf /")).toThrow(
        /Invalid character/,
      );
      expect(() => validateTarget("host|cat /etc/passwd")).toThrow(
        /Invalid character/,
      );
      expect(() => validateTarget("host`whoami`")).toThrow(/Invalid character/);
    });

    it("should reject path traversal attempts", () => {
      expect(() => validateTarget("../etc/passwd")).toThrow();
      expect(() => validateTarget("/etc/passwd")).toThrow();
      expect(() => validateTarget("~/.ssh/id_rsa")).toThrow();
    });
  });
});
