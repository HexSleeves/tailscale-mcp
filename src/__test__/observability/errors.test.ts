import { describe, expect, test } from "bun:test";
import { AppError, toMcpError } from "../../observability/errors.js";

describe("toMcpError", () => {
  test("AppError surfaces safeMessage without structuredContent", () => {
    const result = toMcpError(
      new AppError(
        "Tool requires admin risk level",
        "risk_level_denied",
        403,
        "Tool requires admin risk level",
      ),
    );
    expect(result.isError).toBe(true);
    // Must NOT carry structuredContent: it would violate the tool's
    // advertised outputSchema and mask the real error on the client.
    expect("structuredContent" in result).toBe(false);
    expect(result.content).toEqual([
      { type: "text", text: "Tool requires admin risk level" },
    ]);
  });

  test("generic Error surfaces its message without structuredContent", () => {
    const result = toMcpError(new Error("boom"));
    expect(result.isError).toBe(true);
    expect("structuredContent" in result).toBe(false);
    expect(result.content).toEqual([{ type: "text", text: "boom" }]);
  });

  test("non-Error falls back to a safe message", () => {
    const result = toMcpError("weird");
    expect(result.isError).toBe(true);
    expect("structuredContent" in result).toBe(false);
    expect(result.content).toEqual([
      { type: "text", text: "Operation failed" },
    ]);
  });
});
