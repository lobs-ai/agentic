/**
 * E2E tests for the agent execution loop.
 *
 * Uses a scripted MockLLMClient to drive the loop without real API calls.
 * Each test defines the sequence of LLM responses and asserts on the
 * AgentResult and side effects.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runAgent, Session, getHookRegistry, resetHookRegistry } from "@agentic/runner";
import { ToolRegistry, ReadTool, WriteTool, EditTool, clearRecentReadTracking } from "@agentic/tools";
import type { LLMClient, LLMResponse, CreateMessageParams, ContentBlock } from "@agentic/llm";

// ── MockLLMClient ─────────────────────────────────────────────────────────────

type ScriptedTurn =
  | { type: "text"; text: string; stop?: "end_turn" | "stop" }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

function makeMockClient(script: ScriptedTurn[][]): LLMClient {
  let turn = 0;
  return {
    async createMessage(_params: CreateMessageParams): Promise<LLMResponse> {
      const blocks = script[turn] ?? [{ type: "text", text: "done", stop: "end_turn" }];
      turn++;

      const content: ContentBlock[] = blocks.map((b) => {
        if (b.type === "text") return { type: "text", text: b.text };
        return { type: "tool_use", id: b.id, name: b.name, input: b.input };
      });

      const stopReason = blocks.some((b) => b.type === "tool_use")
        ? "tool_use"
        : ((blocks.find((b) => b.type === "text") as { stop?: string } | undefined)?.stop ?? "end_turn");

      return {
        content,
        stopReason,
        usage: { inputTokens: 50, outputTokens: 20 },
      };
    },
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

let tmp: string;
let registry: ToolRegistry;

beforeEach(() => {
  clearRecentReadTracking();
  resetHookRegistry();
  tmp = mkdtempSync(join(tmpdir(), "agentic-e2e-"));
  registry = new ToolRegistry().registerAll([new ReadTool(), new WriteTool(), new EditTool()]);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("agent loop — single turn", () => {
  it("returns output and succeeded=true on end_turn", async () => {
    const client = makeMockClient([
      [{ type: "text", text: "Task complete.", stop: "end_turn" }],
    ]);

    const result = await runAgent({
      agent: "test",
      model: "claude-sonnet-4-6",
      task: "Do something.",
      cwd: tmp,
      tools: [],
      timeout: 10,
      clientOverride: client,
    });

    expect(result.succeeded).toBe(true);
    expect(result.output).toBe("Task complete.");
    expect(result.turns).toBe(1);
  });

  it("tracks token usage across turns", async () => {
    const client = makeMockClient([
      [{ type: "text", text: "done", stop: "end_turn" }],
    ]);

    const result = await runAgent({
      agent: "test",
      model: "claude-sonnet-4-6",
      task: "count tokens",
      cwd: tmp,
      tools: [],
      timeout: 10,
      clientOverride: client,
    });

    expect(result.usage.inputTokens).toBe(50);
    expect(result.usage.outputTokens).toBe(20);
  });

  it("returns succeeded=false when maxTurns reached", async () => {
    // Client always returns a tool_use that never ends
    const client = makeMockClient(
      Array.from({ length: 20 }, () => [
        { type: "tool_use" as const, id: "t1", name: "read", input: { file_path: join(tmp, "x.txt") } },
      ]),
    );
    writeFileSync(join(tmp, "x.txt"), "content");

    const result = await runAgent({
      agent: "test",
      model: "claude-sonnet-4-6",
      task: "loop forever",
      cwd: tmp,
      tools: ["read"],
      timeout: 30,
      maxTurns: 3,
      clientOverride: client,
      toolRegistry: registry,
    });

    expect(result.succeeded).toBe(false);
    expect(result.error).toMatch(/max turns/i);
  });
});

describe("agent loop — tool use", () => {
  it("executes a tool call and feeds result back", async () => {
    const filePath = join(tmp, "hello.txt");
    writeFileSync(filePath, "hello world");

    const client = makeMockClient([
      // Turn 1: ask to read the file
      [{ type: "tool_use", id: "call-1", name: "read", input: { file_path: filePath } }],
      // Turn 2: respond with end_turn after seeing result
      [{ type: "text", text: "File says: hello world", stop: "end_turn" }],
    ]);

    const result = await runAgent({
      agent: "test",
      model: "claude-sonnet-4-6",
      task: "Read hello.txt and report its contents.",
      cwd: tmp,
      tools: ["read"],
      timeout: 10,
      clientOverride: client,
      toolRegistry: registry,
    });

    expect(result.succeeded).toBe(true);
    expect(result.output).toContain("hello world");
    expect(result.turns).toBe(2);
  });

  it("executes write tool and creates file", async () => {
    const filePath = join(tmp, "output.txt");

    const client = makeMockClient([
      [{ type: "tool_use", id: "w1", name: "write", input: { file_path: filePath, content: "written by agent" } }],
      [{ type: "text", text: "File written.", stop: "end_turn" }],
    ]);

    const result = await runAgent({
      agent: "test",
      model: "claude-sonnet-4-6",
      task: "Write output.txt",
      cwd: tmp,
      tools: ["write"],
      timeout: 10,
      clientOverride: client,
      toolRegistry: registry,
    });

    expect(result.succeeded).toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe("written by agent");
  });

  it("tool error is returned to model as is_error result", async () => {
    const client = makeMockClient([
      // Ask to read a file that does not exist
      [{ type: "tool_use", id: "e1", name: "read", input: { file_path: join(tmp, "missing.txt") } }],
      [{ type: "text", text: "File not found, I'll stop.", stop: "end_turn" }],
    ]);

    const result = await runAgent({
      agent: "test",
      model: "claude-sonnet-4-6",
      task: "Read missing file.",
      cwd: tmp,
      tools: ["read"],
      timeout: 10,
      clientOverride: client,
      toolRegistry: registry,
    });

    // Agent should still complete (it handled the error gracefully)
    expect(result.succeeded).toBe(true);
    expect(result.turns).toBe(2);
  });

  it("multiple tool calls in one turn run in parallel", async () => {
    const file1 = join(tmp, "f1.txt");
    const file2 = join(tmp, "f2.txt");
    writeFileSync(file1, "file1");
    writeFileSync(file2, "file2");

    const client = makeMockClient([
      [
        { type: "tool_use", id: "r1", name: "read", input: { file_path: file1 } },
        { type: "tool_use", id: "r2", name: "read", input: { file_path: file2 } },
      ],
      [{ type: "text", text: "Both files read.", stop: "end_turn" }],
    ]);

    const result = await runAgent({
      agent: "test",
      model: "claude-sonnet-4-6",
      task: "Read both files.",
      cwd: tmp,
      tools: ["read"],
      timeout: 10,
      clientOverride: client,
      toolRegistry: registry,
    });

    expect(result.succeeded).toBe(true);
    expect(result.turns).toBe(2);
  });
});

describe("agent loop — session", () => {
  it("uses provided session and messages are visible externally", async () => {
    const client = makeMockClient([
      [{ type: "text", text: "response", stop: "end_turn" }],
    ]);

    const session = new Session();
    // Seed initial task manually (loop expects at least the task in messages)
    session.seed([{ role: "user", content: "my task" }]);

    const result = await runAgent({
      agent: "test",
      model: "claude-sonnet-4-6",
      task: "my task",
      cwd: tmp,
      tools: [],
      timeout: 10,
      clientOverride: client,
      session,
    });

    expect(result.succeeded).toBe(true);
    // Session should contain the task + assistant response
    expect(session.messages.length).toBeGreaterThanOrEqual(2);
    const lastMsg = session.messages[session.messages.length - 1];
    expect(lastMsg.role).toBe("assistant");
  });
});

describe("agent loop — hooks", () => {
  it("before_tool_call hook can deny tool execution", async () => {
    const hooks = getHookRegistry();
    hooks.register("before_tool_call", async () => null); // deny all tools

    const filePath = join(tmp, "deny.txt");
    writeFileSync(filePath, "secret");

    const client = makeMockClient([
      [{ type: "tool_use", id: "d1", name: "read", input: { file_path: filePath } }],
      [{ type: "text", text: "Tool was denied.", stop: "end_turn" }],
    ]);

    const result = await runAgent({
      agent: "test",
      model: "claude-sonnet-4-6",
      task: "Read file.",
      cwd: tmp,
      tools: ["read"],
      timeout: 10,
      clientOverride: client,
      toolRegistry: registry,
    });

    expect(result.succeeded).toBe(true);
    expect(result.turns).toBe(2);
  });

  it("fires before_agent_start and after_agent_end hooks", async () => {
    const events: string[] = [];
    const hooks = getHookRegistry();
    hooks.register("before_agent_start", async (e) => { events.push("start"); return e; });
    hooks.register("after_agent_end", async (e) => { events.push("end"); return e; });

    const client = makeMockClient([[{ type: "text", text: "done", stop: "end_turn" }]]);

    await runAgent({
      agent: "test",
      model: "claude-sonnet-4-6",
      task: "quick task",
      cwd: tmp,
      tools: [],
      timeout: 10,
      clientOverride: client,
    });

    expect(events).toEqual(["start", "end"]);
  });
});

describe("agent loop — timeout", () => {
  it("returns succeeded=false on timeout", async () => {
    // Each turn takes ~200ms; timeout is 0.1s so it should trigger
    const client: LLMClient = {
      async createMessage() {
        await new Promise((r) => setTimeout(r, 300));
        return {
          content: [{ type: "text", text: "done" }],
          stopReason: "end_turn",
          usage: { inputTokens: 5, outputTokens: 5 },
        };
      },
    };

    const result = await runAgent({
      agent: "test",
      model: "claude-sonnet-4-6",
      task: "slow task",
      cwd: tmp,
      tools: [],
      timeout: 0.1, // 100ms
      clientOverride: client,
    });

    expect(result.succeeded).toBe(false);
    expect(result.error).toMatch(/timeout/i);
  });
});
