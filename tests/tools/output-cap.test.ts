import { describe, it, expect } from "vitest";
import { capOutput, DEFAULT_OUTPUT_CAP, DEFAULT_MAX_LINES } from "@agentic/tools";

describe("capOutput", () => {
  it("returns short output unchanged", () => {
    expect(capOutput("hello world")).toBe("hello world");
  });

  it("returns output unchanged when under both limits", () => {
    const text = "line\n".repeat(100);
    expect(capOutput(text)).toBe(text);
  });

  it("truncates by line count and appends notice", () => {
    const lines = Array.from({ length: 2100 }, (_, i) => `line${i}`).join("\n");
    const result = capOutput(lines);
    const resultLines = result.split("\n");
    // 2000 content lines + 1 blank + 1 notice = 2002
    expect(resultLines.length).toBeLessThanOrEqual(2003);
    expect(result).toContain("more lines truncated");
  });

  it("truncates by char count and appends notice", () => {
    const big = "x".repeat(60_000);
    const result = capOutput(big);
    expect(result.length).toBeLessThan(60_000);
    expect(result).toContain("more lines");
  });

  it("breaks at line boundary near 70% of char budget", () => {
    // Fill exactly to budget with newline at ~80% mark
    const part1 = "a".repeat(40_000) + "\n";
    const part2 = "b".repeat(20_000);
    const input = part1 + part2;
    const result = capOutput(input, 50_000, 10_000);
    expect(result).toContain("\n");
    // Should break at the newline, not mid-string
  });

  it("respects custom maxChars", () => {
    const result = capOutput("hello world foo bar", 5, 100);
    expect(result).toContain("[");
  });

  it("respects custom maxLines", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n");
    const result = capOutput(lines, 999_999, 5);
    expect(result).toContain("more lines");
    // kept lines + blank separator + notice = indices 0..4, 5(blank), 6(notice)
    expect(result.split("\n").at(-1)).toContain("more lines");
  });

  it("appends hint text when provided", () => {
    const lines = Array.from({ length: 2100 }, (_, i) => `line${i}`).join("\n");
    const result = capOutput(lines, DEFAULT_OUTPUT_CAP, DEFAULT_MAX_LINES, "Use offset=2001.");
    expect(result).toContain("Use offset=2001.");
  });

  it("exports DEFAULT_OUTPUT_CAP = 50000", () => {
    expect(DEFAULT_OUTPUT_CAP).toBe(50_000);
  });

  it("exports DEFAULT_MAX_LINES = 2000", () => {
    expect(DEFAULT_MAX_LINES).toBe(2000);
  });
});
