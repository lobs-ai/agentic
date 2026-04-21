import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  readTool,
  clearRecentReadTracking,
  hasRecentlyReadFile,
  getReadSnapshot,
} from "@agentic/tools";

let tmp: string;

beforeEach(() => {
  clearRecentReadTracking();
  tmp = mkdtempSync(join(tmpdir(), "agentic-read-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function write(name: string, content: string): string {
  const p = join(tmp, name);
  writeFileSync(p, content, "utf-8");
  return p;
}

describe("readTool", () => {
  it("reads a simple text file", async () => {
    const p = write("a.txt", "hello\nworld\n");
    const result = await readTool({ file_path: p }, tmp);
    expect(result).toContain("hello");
    expect(result).toContain("world");
  });

  it("numbers lines starting at 1 with 6-char padding + tab", async () => {
    const p = write("b.txt", "alpha\nbeta\n");
    const result = await readTool({ file_path: p }, tmp);
    expect(result).toMatch(/^\s+1\t/);
    expect(result).toMatch(/\s+2\t/);
  });

  it("accepts path alias", async () => {
    const p = write("c.txt", "content");
    const result = await readTool({ path: p }, tmp);
    expect(result).toContain("content");
  });

  it("throws when file not found", async () => {
    await expect(readTool({ file_path: "/no/such/file.txt" }, tmp)).rejects.toThrow("not found");
  });

  it("throws when path is a directory", async () => {
    await expect(readTool({ file_path: tmp }, tmp)).rejects.toThrow("directory");
  });

  it("throws when file_path is missing", async () => {
    await expect(readTool({}, tmp)).rejects.toThrow("required");
  });

  it("blocks /dev/zero", async () => {
    await expect(readTool({ file_path: "/dev/zero" }, tmp)).rejects.toThrow("device file");
  });

  it("returns binary notice for binary files", async () => {
    const p = join(tmp, "bin.dat");
    const buf = Buffer.alloc(16, 0);
    buf[4] = 0; // ensure null byte
    writeFileSync(p, buf);
    const result = await readTool({ file_path: p }, tmp);
    expect(result).toMatch(/binary file/i);
  });

  it("respects offset (1-based)", async () => {
    const p = write("lines.txt", "one\ntwo\nthree\nfour\n");
    const result = await readTool({ file_path: p, offset: 3 }, tmp);
    expect(result).not.toContain("one");
    expect(result).not.toContain("two");
    expect(result).toContain("three");
    expect(result).toContain("four");
  });

  it("respects limit", async () => {
    const p = write("lines.txt", "one\ntwo\nthree\nfour\n");
    const result = await readTool({ file_path: p, limit: 2 }, tmp);
    expect(result).toContain("one");
    expect(result).toContain("two");
    expect(result).not.toContain("three");
  });

  it("full mode returns raw content without line numbers", async () => {
    const p = write("raw.txt", "hello world");
    const result = await readTool({ file_path: p, full: true }, tmp);
    expect(result).toBe("hello world");
  });

  it("full mode throws for files > 200KB", async () => {
    const p = join(tmp, "big.txt");
    writeFileSync(p, "x".repeat(201 * 1024));
    await expect(readTool({ file_path: p, full: true }, tmp)).rejects.toThrow("too large");
  });

  it("registers a read snapshot after read", async () => {
    const p = write("snap.txt", "data");
    expect(hasRecentlyReadFile(p, tmp)).toBe(false);
    await readTool({ file_path: p }, tmp);
    expect(hasRecentlyReadFile(p, tmp)).toBe(true);
  });

  it("getReadSnapshot returns snapshot after read", async () => {
    const p = write("snap2.txt", "data");
    await readTool({ file_path: p }, tmp);
    const snap = getReadSnapshot(p);
    expect(snap).not.toBeNull();
    expect(snap!.size).toBeGreaterThan(0);
    expect(snap!.contentHash).toBeTruthy();
  });

  it("clearRecentReadTracking clears snapshots", async () => {
    const p = write("clear.txt", "data");
    await readTool({ file_path: p }, tmp);
    expect(hasRecentlyReadFile(p, tmp)).toBe(true);
    clearRecentReadTracking();
    expect(hasRecentlyReadFile(p, tmp)).toBe(false);
  });

  it("adds continuation hint when file is truncated", async () => {
    // Write 600 lines to exceed DEFAULT_LINES (500)
    const content = Array.from({ length: 600 }, (_, i) => `line${i}`).join("\n");
    const p = write("long.txt", content);
    const result = await readTool({ file_path: p }, tmp);
    expect(result).toMatch(/offset=\d+/);
  });
});
