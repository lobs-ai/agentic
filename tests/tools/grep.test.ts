import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { grepTool } from "@agentic/tools";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "agentic-grep-test-"));
  writeFileSync(join(tmp, "a.txt"), "hello world\nfoo bar\nbaz\n");
  writeFileSync(join(tmp, "b.txt"), "HELLO WORLD\nsomething else\n");
  writeFileSync(join(tmp, "c.ts"), "const hello = 'world';\nexport default hello;\n");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("grepTool", () => {
  it("finds pattern in files", async () => {
    const result = await grepTool({ pattern: "hello" }, tmp);
    expect(result).toContain("hello");
  });

  it("returns no-match message when not found", async () => {
    const result = await grepTool({ pattern: "ZZZNOMATCH" }, tmp);
    expect(result).toContain("No matches");
  });

  it("glob filter restricts to matching files", async () => {
    const result = await grepTool({ pattern: "hello", glob: "*.ts" }, tmp);
    // Should match c.ts but not .txt
    expect(result).toContain("hello");
  });

  it("output_mode files_with_matches returns file paths", async () => {
    const result = await grepTool({ pattern: "hello", output_mode: "files_with_matches" }, tmp);
    expect(result).toMatch(/\.(txt|ts)/);
    expect(result).not.toContain("world"); // shouldn't show matching lines
  });

  it("output_mode count returns counts", async () => {
    const result = await grepTool({ pattern: "hello", output_mode: "count" }, tmp);
    expect(result).toMatch(/\d+/);
  });

  it("case_sensitive=false matches case-insensitively", async () => {
    const result = await grepTool({ pattern: "hello", case_sensitive: false }, tmp);
    expect(result).toContain("HELLO");
  });

  it("case_sensitive=true does NOT match HELLO with pattern hello", async () => {
    const result = await grepTool({ pattern: "hello", case_sensitive: true }, tmp);
    // b.txt has HELLO — should not be in results
    const lines = result.split("\n");
    const bLines = lines.filter((l) => l.toLowerCase().includes("hello world") && l.includes("HELLO"));
    expect(bLines.length).toBe(0);
  });

  it("context_lines adds surrounding lines", async () => {
    const result = await grepTool({ pattern: "baz", context_lines: 1 }, tmp);
    // baz is line 3 of a.txt — context should include foo bar above
    expect(result).toContain("foo bar");
  });

  it("throws when pattern is missing", async () => {
    await expect(grepTool({}, tmp)).rejects.toThrow("required");
  });
});
