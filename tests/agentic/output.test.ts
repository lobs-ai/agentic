import { describe, it, expect, vi } from "vitest";
import { parseJsonOutput, extract } from "agentic";
import type { LLMClient, LLMResponse } from "@agentic/llm";

// ── parseJsonOutput ───────────────────────────────────────────────────────────

describe("parseJsonOutput", () => {
  it("parses bare JSON object", () => {
    expect(parseJsonOutput('{"name":"Alice"}')).toEqual({ name: "Alice" });
  });

  it("parses bare JSON array", () => {
    expect(parseJsonOutput("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("strips ```json ... ``` fences", () => {
    const result = parseJsonOutput('```json\n{"x":1}\n```');
    expect(result).toEqual({ x: 1 });
  });

  it("strips ``` ... ``` fences (no language tag)", () => {
    const result = parseJsonOutput("```\n[1,2]\n```");
    expect(result).toEqual([1, 2]);
  });

  it("extracts first JSON object from prose", () => {
    const result = parseJsonOutput('Here is the result: {"key":"val"} and that is it.');
    expect(result).toEqual({ key: "val" });
  });

  it("extracts first JSON array from prose", () => {
    const result = parseJsonOutput("Output: [1,2,3]. Done.");
    expect(result).toEqual([1, 2, 3]);
  });

  it("prefers earlier match between object and array", () => {
    const result = parseJsonOutput('[1] and {"a":2}');
    expect(result).toEqual([1]);
  });

  it("throws SyntaxError when no JSON found", () => {
    expect(() => parseJsonOutput("no json here")).toThrow(SyntaxError);
  });

  it("throws SyntaxError for malformed JSON", () => {
    expect(() => parseJsonOutput("{broken json}")).toThrow();
  });
});

// ── extract() ─────────────────────────────────────────────────────────────────

function makeMockClient(responses: string[]): LLMClient {
  let idx = 0;
  return {
    createMessage: vi.fn(async () => {
      const text = responses[idx] ?? "{}";
      idx++;
      return {
        content: [{ type: "text", text }],
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 10 },
      } satisfies LLMResponse;
    }),
  };
}

describe("extract()", () => {
  it("returns parsed value on first success", async () => {
    const client = makeMockClient(['{"score":42}']);
    const result = await extract(client, "claude-sonnet-4-6", "give me json");
    expect(result).toEqual({ score: 42 });
  });

  it("calls validate and returns typed result", async () => {
    const client = makeMockClient(['{"count":7}']);
    const result = await extract<{ count: number }>(
      client,
      "claude-sonnet-4-6",
      "give me json",
      { validate: (d) => d as { count: number } },
    );
    expect(result.count).toBe(7);
  });

  it("retries when output is not parseable JSON", async () => {
    const client = makeMockClient(["not json at all", '{"ok":true}']);
    const result = await extract(client, "claude-sonnet-4-6", "prompt");
    expect(result).toEqual({ ok: true });
    expect((client.createMessage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it("retries when validate throws", async () => {
    const client = makeMockClient(['{"v":1}', '{"v":2}']);
    const result = await extract<{ v: number }>(
      client,
      "claude-sonnet-4-6",
      "prompt",
      {
        validate: (d) => {
          const obj = d as { v: number };
          if (obj.v !== 2) throw new Error("need v=2");
          return obj;
        },
      },
    );
    expect(result.v).toBe(2);
  });

  it("throws after maxRetries exhausted", async () => {
    const client = makeMockClient(["bad", "bad", "bad"]);
    await expect(
      extract(client, "claude-sonnet-4-6", "prompt", { maxRetries: 2 }),
    ).rejects.toThrow("failed after");
  });

  it("sends previous error in retry messages", async () => {
    const client = makeMockClient(["bad json", '{"fixed":true}']);
    await extract(client, "claude-sonnet-4-6", "prompt", { maxRetries: 1 });
    const calls = (client.createMessage as ReturnType<typeof vi.fn>).mock.calls;
    // Second call should have 3 messages: original prompt + bad response + error correction
    expect(calls[1][0].messages).toHaveLength(3);
    expect(calls[1][0].messages[2].content).toContain("could not be parsed");
  });
});
