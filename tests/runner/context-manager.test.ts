import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  shouldCompact,
  compactMessages,
  getContextLimit,
} from "@agentic/runner";
import type { LLMMessage } from "@agentic/llm";

const userMsg = (content: string): LLMMessage => ({ role: "user", content });
const assistantMsg = (content: string): LLMMessage => ({ role: "assistant", content });

describe("getContextLimit", () => {
  it("returns 200k for claude-sonnet-4-6", () => {
    expect(getContextLimit("claude-sonnet-4-6")).toBe(200_000);
  });
  it("returns 200k for claude-opus-4", () => {
    expect(getContextLimit("claude-opus-4")).toBe(200_000);
  });
  it("returns 128k for gpt-4o", () => {
    expect(getContextLimit("gpt-4o")).toBe(128_000);
  });
  it("returns 1M for gemini-2.0-flash", () => {
    expect(getContextLimit("gemini-2.0-flash")).toBe(1_000_000);
  });
  it("returns default for unknown models", () => {
    expect(getContextLimit("unknown-model-xyz")).toBe(100_000);
  });
});

describe("estimateTokens", () => {
  it("returns a small number for empty array", () => {
    expect(estimateTokens([])).toBeLessThanOrEqual(2);
  });
  it("returns positive number for messages", () => {
    const msgs = [userMsg("hello world"), assistantMsg("hi there")];
    expect(estimateTokens(msgs)).toBeGreaterThan(0);
  });
  it("increases with more content", () => {
    const short = [userMsg("hi")];
    const long = [userMsg("hi".repeat(1000))];
    expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short));
  });
});

describe("shouldCompact", () => {
  it("returns false for small conversations", () => {
    const msgs = [userMsg("task"), assistantMsg("ok")];
    expect(shouldCompact(msgs, "claude-sonnet-4-6")).toBe(false);
  });

  it("returns true when estimated tokens exceed 80% of context limit", () => {
    // GPT-4o limit is 128k tokens, 80% = 102.4k tokens ~ 409.6k chars
    // Create a message array with enough chars to exceed that
    const bigContent = "x".repeat(500_000);
    const msgs = [userMsg(bigContent)];
    expect(shouldCompact(msgs, "gpt-4o")).toBe(true);
  });
});

describe("compactMessages", () => {
  it("returns short arrays unchanged (<=2)", () => {
    const msgs = [userMsg("task")];
    expect(compactMessages(msgs)).toEqual(msgs);
  });

  it("always keeps the first message", () => {
    const msgs = [
      userMsg("TASK"),
      assistantMsg("step1"),
      userMsg("step2"),
      assistantMsg("step3"),
      userMsg("step4"),
      assistantMsg("step5"),
    ];
    const result = compactMessages(msgs, 1);
    expect(result[0].content).toBe("TASK");
  });

  it("truncates long tool results in older messages", () => {
    const longOutput = "x".repeat(2000);
    const toolResultMsg: LLMMessage = {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "tid",
          content: longOutput,
        } as unknown as Record<string, unknown>,
      ] as unknown as string,
    };
    const msgs = [
      userMsg("task"),
      toolResultMsg,
      assistantMsg("a1"),
      userMsg("u2"),
      assistantMsg("a2"),
      userMsg("u3"),
      assistantMsg("a3"),
      userMsg("u4"),
      assistantMsg("a4"),
      userMsg("u5"),
      assistantMsg("a5"),
      userMsg("u6"),
    ];
    const result = compactMessages(msgs, 2);
    const truncatedMsg = result[1] as LLMMessage;
    if (Array.isArray(truncatedMsg.content)) {
      const block = truncatedMsg.content[0] as Record<string, unknown>;
      if (typeof block.content === "string") {
        expect(block.content.length).toBeLessThanOrEqual(520); // 500 + "...[truncated]"
      }
    }
  });

  it("keeps recent turns verbatim", () => {
    const msgs: LLMMessage[] = [];
    msgs.push(userMsg("task")); // first
    for (let i = 0; i < 20; i++) {
      msgs.push(assistantMsg(`turn${i}`));
      msgs.push(userMsg(`user${i}`));
    }
    const result = compactMessages(msgs, 3);
    // Last 6 messages (3 turns × 2) should be verbatim
    const tail = result.slice(-6);
    const originalTail = msgs.slice(-6);
    expect(tail).toEqual(originalTail);
  });
});
