import { describe, expect, it } from "bun:test";
import { splitCsv } from "../../src/config.ts";

describe("splitCsv", () => {
  it("trims and drops empties", () => {
    expect(splitCsv(" a , b,, c ")).toEqual(["a", "b", "c"]);
  });

  it("handles empty input", () => {
    expect(splitCsv("")).toEqual([]);
  });
});
