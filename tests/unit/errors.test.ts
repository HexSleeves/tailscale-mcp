import { describe, expect, it } from "bun:test";
import {
  CLIError,
  getErrorMessage,
  TailscaleError,
  ValidationError,
} from "../../src/errors.ts";

describe("error classes", () => {
  it("TailscaleError carries code + statusCode", () => {
    const e = new TailscaleError("nope", { code: "E_X", statusCode: 418 });
    expect(e.message).toBe("nope");
    expect(e.code).toBe("E_X");
    expect(e.statusCode).toBe(418);
    expect(e.name).toBe("TailscaleError");
  });

  it("CLIError carries stderr + exitCode", () => {
    const e = new CLIError("boom", { stderr: "bad", exitCode: 2 });
    expect(e.stderr).toBe("bad");
    expect(e.exitCode).toBe(2);
  });

  it("ValidationError exposes message", () => {
    expect(new ValidationError("bad input").message).toBe("bad input");
  });
});

describe("getErrorMessage", () => {
  it("uses Error.message", () => {
    expect(getErrorMessage(new Error("x"))).toBe("x");
  });

  it("prefers axios-style response.data.error", () => {
    const e = Object.assign(new Error("outer"), {
      response: { data: { error: "inner-real-cause" } },
    });
    expect(getErrorMessage(e)).toBe("inner-real-cause");
  });

  it("handles plain objects with message", () => {
    expect(getErrorMessage({ message: "hi" })).toBe("hi");
  });

  it("falls back to String()", () => {
    expect(getErrorMessage(42)).toBe("42");
    expect(getErrorMessage(null)).toBe("null");
  });
});
