import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readTool, editTool, clearRecentReadTracking } from "@agentic/tools";

let tmp: string;

beforeEach(() => {
  clearRecentReadTracking();
  tmp = mkdtempSync(join(tmpdir(), "agentic-edit-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

async function makeFile(name: string, content: string): Promise<string> {
  const p = join(tmp, name);
  writeFileSync(p, content, "utf-8");
  await readTool({ file_path: p }, tmp); // register snapshot
  return p;
}

describe("editTool — must-read-before-edit", () => {
  it("throws if file was not read", async () => {
    const p = join(tmp, "unread.txt");
    writeFileSync(p, "content");
    await expect(
      editTool({ file_path: p, old_string: "content", new_string: "changed" }, tmp),
    ).rejects.toThrow("Read");
  });

  it("allows edit after read", async () => {
    const p = await makeFile("ok.txt", "hello world");
    const result = await editTool({ file_path: p, old_string: "hello", new_string: "goodbye" }, tmp);
    expect(result).toContain("Edit applied");
    expect(readFileSync(p, "utf-8")).toBe("goodbye world");
  });
});

describe("editTool — exact matching", () => {
  it("replaces exact text", async () => {
    const p = await makeFile("exact.txt", "foo bar baz");
    await editTool({ file_path: p, old_string: "bar", new_string: "qux" }, tmp);
    expect(readFileSync(p, "utf-8")).toBe("foo qux baz");
  });

  it("throws when old_string not found", async () => {
    const p = await makeFile("notfound.txt", "some content here");
    await expect(
      editTool({ file_path: p, old_string: "missing text", new_string: "x" }, tmp),
    ).rejects.toThrow("Could not find");
  });

  it("throws on multiple matches with line numbers", async () => {
    const p = await makeFile("multi.txt", "dup\ndup\n");
    await expect(
      editTool({ file_path: p, old_string: "dup", new_string: "unique" }, tmp),
    ).rejects.toThrow(/lines \d+ and \d+/);
  });

  it("replace_all replaces every occurrence", async () => {
    const p = await makeFile("replaceall.txt", "a a a");
    await editTool({ file_path: p, old_string: "a", new_string: "b", replace_all: true }, tmp);
    expect(readFileSync(p, "utf-8")).toBe("b b b");
  });
});

describe("editTool — fuzzy matching", () => {
  it("suggests actual text when whitespace differs", async () => {
    const p = await makeFile("fuzzy.txt", "\tfunction foo(x) {\n\t\treturn x;\n\t}\n");
    await expect(
      editTool({ file_path: p, old_string: "function foo(x) {\n  return x;\n}", new_string: "REPLACED_FUNCTION" }, tmp),
    ).rejects.toThrow("Did you mean");
  });

  it("normalizes curly quotes when matching", async () => {
    const p = await makeFile("quotes.txt", "use \"straight\" quotes");
    const result = await editTool({
      file_path: p,
      old_string: "use “straight” quotes",
      new_string: "use 'single' quotes",
    }, tmp);
    expect(result).toContain("Edit applied");
    expect(readFileSync(p, "utf-8")).toBe("use 'single' quotes");
  });
});

describe("editTool — idempotent edits", () => {
  it("no-op when new_string already present", async () => {
    const p = await makeFile("idempotent.txt", "target text");
    const result = await editTool(
      { file_path: p, old_string: "original", new_string: "target text" },
      tmp,
    );
    expect(result).toContain("Idempotent");
    expect(readFileSync(p, "utf-8")).toBe("target text");
  });
});

describe("editTool — diff output", () => {
  it("returns unified diff", async () => {
    const p = await makeFile("diff.txt", "before\nstuff\nafter\n");
    const result = await editTool({ file_path: p, old_string: "stuff", new_string: "changed" }, tmp);
    expect(result).toContain("---");
    expect(result).toContain("+++");
    expect(result).toContain("-stuff");
    expect(result).toContain("+changed");
  });
});

describe("editTool — batch edits", () => {
  it("applies multiple edits in sequence", async () => {
    const p = await makeFile("batch.txt", "alpha beta gamma");
    const result = await editTool({
      file_path: p,
      edits: [
        { old_string: "alpha", new_string: "A" },
        { old_string: "beta", new_string: "B" },
        { old_string: "gamma", new_string: "C" },
      ],
    }, tmp);
    expect(readFileSync(p, "utf-8")).toBe("A B C");
    expect(result).toContain("3/3");
  });

  it("writes partial results and reports failure for bad batch", async () => {
    const p = await makeFile("partial.txt", "first second third");
    const result = await editTool({
      file_path: p,
      edits: [
        { old_string: "first", new_string: "1st" },
        { old_string: "NOSUCH", new_string: "x" },
      ],
    }, tmp);
    // First edit applied
    expect(readFileSync(p, "utf-8")).toContain("1st");
    // Reports failure
    expect(result).toContain("FAILED");
    expect(result).toContain("1/2");
  });

  it("validates batch: rejects empty old_string", async () => {
    const p = await makeFile("val.txt", "content");
    await expect(
      editTool({ file_path: p, edits: [{ old_string: "", new_string: "x" }] }, tmp),
    ).rejects.toThrow("empty");
  });

  it("validates batch: rejects duplicate edits", async () => {
    const p = await makeFile("dup.txt", "something here");
    await expect(
      editTool({
        file_path: p,
        edits: [
          { old_string: "something", new_string: "x" },
          { old_string: "something", new_string: "x" },
        ],
      }, tmp),
    ).rejects.toThrow("duplicates");
  });
});

describe("editTool — staleness check", () => {
  it("throws when file changes between read and edit", async () => {
    const p = await makeFile("stale.txt", "original");
    // Mutate the file externally after reading
    writeFileSync(p, "tampered content");
    await expect(
      editTool({ file_path: p, old_string: "original", new_string: "changed" }, tmp),
    ).rejects.toThrow(/modified since/);
  });
});

describe("editTool — validation", () => {
  it("throws when file not found", async () => {
    clearRecentReadTracking();
    await expect(
      editTool({ file_path: join(tmp, "gone.txt"), old_string: "x", new_string: "y" }, tmp),
    ).rejects.toThrow("not found");
  });

  it("throws when old_string missing without edits[]", async () => {
    const p = await makeFile("req.txt", "data");
    await expect(
      editTool({ file_path: p, new_string: "y" }, tmp),
    ).rejects.toThrow("old_string");
  });
});
