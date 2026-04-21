import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execTool } from "@agentic/tools";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "agentic-exec-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("execTool", () => {
  it("runs a simple command and captures stdout", async () => {
    const result = await execTool({ cmd: "echo hello" }, tmp);
    expect(typeof result === "string" ? result : result.result).toContain("hello");
  });

  it("captures exit code", async () => {
    const result = await execTool({ cmd: "exit 42" }, tmp);
    const str = typeof result === "string" ? result : result.result;
    expect(str).toContain("42");
  });

  it("captures stderr separately", async () => {
    const result = await execTool({ cmd: "echo err >&2" }, tmp);
    const str = typeof result === "string" ? result : result.result;
    expect(str).toContain("stderr");
  });

  it("cmd and command aliases both work", async () => {
    const r1 = await execTool({ cmd: "echo cmd" }, tmp);
    const r2 = await execTool({ command: "echo command" }, tmp);
    const s1 = typeof r1 === "string" ? r1 : r1.result;
    const s2 = typeof r2 === "string" ? r2 : r2.result;
    expect(s1).toContain("cmd");
    expect(s2).toContain("command");
  });

  it("throws when cmd is missing", async () => {
    await expect(execTool({}, tmp)).rejects.toThrow("required");
  });

  it("bare cd changes cwd via sideEffects", async () => {
    const result = await execTool({ cmd: `cd ${tmpdir()}` }, tmp);
    expect(typeof result).toBe("object");
    const obj = result as { result: string; sideEffects?: { newCwd?: string } };
    expect(obj.sideEffects?.newCwd).toBeTruthy();
  });

  it("bare cd to nonexistent dir returns error string", async () => {
    const result = await execTool({ cmd: "cd /no/such/dir/exists" }, tmp);
    const str = typeof result === "string" ? result : result.result;
    expect(str).toContain("no such directory");
  });

  it("detects cwd change from cd inside compound command", async () => {
    const result = await execTool({ cmd: `cd ${tmpdir()} && pwd` }, tmp);
    const str = typeof result === "string" ? result : result.result;
    // Should show tmpdir in stdout
    expect(str).toContain(tmpdir().split("/").pop() ?? "tmp");
  });

  it("run_in_background returns immediately without output", async () => {
    const result = await execTool({ cmd: "sleep 60", run_in_background: true }, tmp);
    const str = typeof result === "string" ? result : result.result;
    expect(str).toContain("background");
  });

  it("respects timeout and marks as timeout", async () => {
    const result = await execTool({ cmd: "sleep 10", timeout: 1 }, tmp);
    const str = typeof result === "string" ? result : result.result;
    expect(str).toContain("timeout");
  });

  it("passes custom env vars", async () => {
    const result = await execTool({
      cmd: "echo $MY_TEST_VAR",
      env: { MY_TEST_VAR: "hello_env" },
    }, tmp);
    const str = typeof result === "string" ? result : result.result;
    expect(str).toContain("hello_env");
  });

  it("respects workdir parameter", async () => {
    const result = await execTool({ cmd: "pwd", workdir: tmpdir() }, tmp);
    const str = typeof result === "string" ? result : result.result;
    expect(str).toContain(tmpdir());
  });
});
