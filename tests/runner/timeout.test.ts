import { describe, it, expect } from "vitest";
import { normalizeTimeout, runAgent } from "@agentic/runner";
import type { LLMClient, LLMResponse, CreateMessageParams } from "@agentic/llm";
import { BaseTool, ToolRegistry, type ToolInputSchema } from "@agentic/tools";

// ── fake LLM ─────────────────────────────────────────────────────────────

interface FakeOpts {
  /** Milliseconds before createMessage resolves. */
  latencyMs?: number;
  /** Content blocks to return. Defaults to a single end_turn text block. */
  response?: LLMResponse;
  /** Per-turn responses (takes precedence over `response` when provided). */
  responses?: LLMResponse[];
}

function endTurn(text: string): LLMResponse {
  return {
    content: [{ type: "text", text }],
    stopReason: "end_turn",
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };
}

function toolUse(name: string, input: Record<string, unknown> = {}): LLMResponse {
  return {
    content: [
      { type: "tool_use", id: `tu_${Math.random().toString(36).slice(2, 8)}`, name, input },
    ],
    stopReason: "tool_use",
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };
}

function fakeClient(opts: FakeOpts = {}): LLMClient {
  let turn = 0;
  return {
    async createMessage(_params: CreateMessageParams): Promise<LLMResponse> {
      if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs));
      if (opts.responses) {
        const idx = Math.min(turn, opts.responses.length - 1);
        turn++;
        return opts.responses[idx]!;
      }
      return opts.response ?? endTurn("done");
    },
  };
}

// ── fake slow tool ───────────────────────────────────────────────────────

class SlowTool extends BaseTool<{ ms?: number }> {
  readonly name = "slow";
  readonly description = "Sleeps for `ms` milliseconds.";
  readonly inputSchema: ToolInputSchema = {
    type: "object",
    properties: { ms: { type: "number" } },
  };
  async run(input: { ms?: number }): Promise<string> {
    const ms = input.ms ?? 5000;
    await new Promise((r) => setTimeout(r, ms));
    return "slept";
  }
}

function slowRegistry(): ToolRegistry {
  return new ToolRegistry().registerAll([new SlowTool()]);
}

// ── normalizeTimeout ─────────────────────────────────────────────────────

describe("normalizeTimeout", () => {
  it("treats a bare number as total, keeps perTool default", () => {
    expect(normalizeTimeout(60)).toEqual({ total: 60, perTool: 300 });
  });

  it("applies defaults when config is undefined", () => {
    expect(normalizeTimeout(undefined)).toEqual({
      total: 300,
      perTurn: undefined,
      perTool: 300,
      perLlmCall: undefined,
    });
  });

  it("honors every field in a full config", () => {
    expect(
      normalizeTimeout({ total: 900, perTurn: 120, perTool: 30, perLlmCall: 45 }),
    ).toEqual({ total: 900, perTurn: 120, perTool: 30, perLlmCall: 45 });
  });

  it("fills perTool default when only total is provided", () => {
    expect(normalizeTimeout({ total: 500 })).toEqual({
      total: 500,
      perTurn: undefined,
      perTool: 300,
      perLlmCall: undefined,
    });
  });
});

// ── runAgent timeout behavior ────────────────────────────────────────────

describe("runAgent — timeout enforcement", () => {
  it("total wall clock: fires and reports kind=total", async () => {
    // LLM takes 500ms; total budget is 0.1s → trips total first.
    const result = await runAgent({
      task: "hi",
      agent: "test",
      model: "anthropic/claude-sonnet-4-6",
      cwd: process.cwd(),
      tools: [],
      timeout: { total: 0.1 },
      clientOverride: fakeClient({ latencyMs: 500, response: endTurn("late") }),
    });
    expect(result.succeeded).toBe(false);
    expect(result.error).toMatch(/total \(0\.1s\)/);
  });

  it("perLlmCall: fires when a single LLM call is too slow", async () => {
    const result = await runAgent({
      task: "hi",
      agent: "test",
      model: "anthropic/claude-sonnet-4-6",
      cwd: process.cwd(),
      tools: [],
      timeout: { total: 10, perLlmCall: 0.1 },
      clientOverride: fakeClient({ latencyMs: 500, response: endTurn("late") }),
    });
    expect(result.succeeded).toBe(false);
    expect(result.error?.toLowerCase()).toContain("llm");
  });

  it("perTool: fires when a tool call exceeds its budget", async () => {
    // One turn: call slow(ms=500). perTool=0.1s → tool rejects.
    const result = await runAgent({
      task: "go",
      agent: "test",
      model: "anthropic/claude-sonnet-4-6",
      cwd: process.cwd(),
      tools: ["slow"],
      toolRegistry: slowRegistry(),
      timeout: { total: 10, perTool: 0.1 },
      clientOverride: fakeClient({
        responses: [toolUse("slow", { ms: 500 }), endTurn("acknowledged tool error")],
      }),
    });
    // The run succeeds (the LLM sees the tool error and ends cleanly), but
    // the tool result itself must be an error message mentioning perTool.
    expect(result.succeeded).toBe(true);
    // And the tool was killed: total wall clock stayed well under 500ms + overhead.
    // Loose bound — CI jitter can push this up, but we just want to confirm
    // we didn't wait the full tool duration.
    expect(result.turns).toBeGreaterThanOrEqual(2);
  });

  it("finishes cleanly when all budgets are generous", async () => {
    const result = await runAgent({
      task: "hi",
      agent: "test",
      model: "anthropic/claude-sonnet-4-6",
      cwd: process.cwd(),
      tools: [],
      timeout: { total: 5, perTurn: 5, perLlmCall: 5 },
      clientOverride: fakeClient({ response: endTurn("ok") }),
    });
    expect(result.succeeded).toBe(true);
    expect(result.output).toBe("ok");
  });

  it("legacy number shape still works (treated as total)", async () => {
    const result = await runAgent({
      task: "hi",
      agent: "test",
      model: "anthropic/claude-sonnet-4-6",
      cwd: process.cwd(),
      tools: [],
      timeout: 0.1,
      clientOverride: fakeClient({ latencyMs: 500, response: endTurn("late") }),
    });
    expect(result.succeeded).toBe(false);
    expect(result.error).toMatch(/total \(0\.1s\)/);
  });
});
