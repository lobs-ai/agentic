import { describe, it, expect } from "vitest";
import { resolveToCwd } from "@agentic/tools";
import { homedir } from "os";

describe("resolveToCwd", () => {
  it("returns absolute paths unchanged", () => {
    expect(resolveToCwd("/foo/bar", "/cwd")).toBe("/foo/bar");
  });

  it("resolves relative paths against cwd", () => {
    expect(resolveToCwd("bar/baz.ts", "/foo")).toBe("/foo/bar/baz.ts");
  });

  it("resolves ./ paths against cwd", () => {
    expect(resolveToCwd("./bar.ts", "/foo")).toBe("/foo/bar.ts");
  });

  it("resolves ../ paths against cwd", () => {
    expect(resolveToCwd("../bar.ts", "/foo/sub")).toBe("/foo/bar.ts");
  });

  it("expands ~ to home directory", () => {
    const home = homedir();
    expect(resolveToCwd("~/docs/file.txt", "/cwd")).toBe(`${home}/docs/file.txt`);
  });

  it("expands bare ~ to home directory", () => {
    const home = homedir();
    // "~" alone: resolve(home, "") → home
    expect(resolveToCwd("~/", "/cwd")).toBe(home);
  });
});
