import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { writeTool, readTool, editTool, clearRecentReadTracking, hasRecentlyReadFile } from "@agentic/tools";

let tmp: string;

beforeEach(() => {
  clearRecentReadTracking();
  tmp = mkdtempSync(join(tmpdir(), "agentic-write-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("writeTool", () => {
  it("creates a new file", async () => {
    const p = join(tmp, "new.txt");
    await writeTool({ file_path: p, content: "hello" }, tmp);
    expect(readFileSync(p, "utf-8")).toBe("hello");
  });

  it("overwrites an existing file", async () => {
    const p = join(tmp, "existing.txt");
    await writeTool({ file_path: p, content: "first" }, tmp);
    await writeTool({ file_path: p, content: "second" }, tmp);
    expect(readFileSync(p, "utf-8")).toBe("second");
  });

  it("creates parent directories automatically", async () => {
    const p = join(tmp, "deep", "nested", "file.txt");
    await writeTool({ file_path: p, content: "deep" }, tmp);
    expect(existsSync(p)).toBe(true);
  });

  it("accepts path alias", async () => {
    const p = join(tmp, "alias.txt");
    await writeTool({ path: p, content: "via alias" }, tmp);
    expect(existsSync(p)).toBe(true);
  });

  it("throws when file_path is missing", async () => {
    await expect(writeTool({ content: "x" }, tmp)).rejects.toThrow("required");
  });

  it("throws when content is null", async () => {
    const p = join(tmp, "x.txt");
    await expect(writeTool({ file_path: p, content: null as unknown as string }, tmp)).rejects.toThrow("required");
  });

  it("throws when target is a directory", async () => {
    await expect(writeTool({ file_path: tmp, content: "x" }, tmp)).rejects.toThrow("directory");
  });

  it("returns bytes written", async () => {
    const p = join(tmp, "bytes.txt");
    const result = await writeTool({ file_path: p, content: "hello" }, tmp);
    expect(result).toContain("5");
  });

  it("registers snapshot so subsequent edit does not require re-read", async () => {
    const p = join(tmp, "seq.txt");
    await writeTool({ file_path: p, content: "original line\n" }, tmp);
    // snapshot was registered by write — edit should succeed without a separate read
    const result = await editTool({ file_path: p, old_string: "original line", new_string: "edited line" }, tmp);
    expect(result).toContain("Edit applied");
    expect(readFileSync(p, "utf-8")).toContain("edited line");
  });

  it("hasRecentlyReadFile returns true after write", async () => {
    const p = join(tmp, "check.txt");
    await writeTool({ file_path: p, content: "data" }, tmp);
    expect(hasRecentlyReadFile(p, tmp)).toBe(true);
  });
});
