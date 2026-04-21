import { describe, it, expect, beforeEach, vi } from "vitest";
import { getHookRegistry, resetHookRegistry, type HookEvent } from "@agentic/runner";

beforeEach(() => {
  resetHookRegistry();
});

const makeEvent = (toolName = "read", toolInput = {}): HookEvent => ({
  agentType: "test",
  taskId: "t1",
  data: { toolName, toolInput },
  timestamp: new Date(),
});

describe("HookRegistry", () => {
  it("starts with no handlers", async () => {
    const reg = getHookRegistry();
    const event = makeEvent();
    const result = await reg.emit("before_tool_call", event);
    expect(result).toEqual(event);
  });

  it("calls registered handler", async () => {
    const reg = getHookRegistry();
    const handler = vi.fn(async (e: HookEvent) => e);
    reg.register("before_tool_call", handler);
    await reg.emit("before_tool_call", makeEvent());
    expect(handler).toHaveBeenCalledOnce();
  });

  it("handler can modify the event", async () => {
    const reg = getHookRegistry();
    reg.register("before_tool_call", async (e) => ({
      ...e,
      data: { ...e.data, toolName: "modified" },
    }));
    const result = await reg.emit("before_tool_call", makeEvent("original"));
    expect(result?.data.toolName).toBe("modified");
  });

  it("returning null denies execution", async () => {
    const reg = getHookRegistry();
    reg.register("before_tool_call", async () => null);
    const result = await reg.emit("before_tool_call", makeEvent());
    expect(result).toBeNull();
  });

  it("null from one handler stops the chain", async () => {
    const reg = getHookRegistry();
    const second = vi.fn(async (e: HookEvent) => e);
    reg.register("before_tool_call", async () => null);
    reg.register("before_tool_call", second);
    await reg.emit("before_tool_call", makeEvent());
    expect(second).not.toHaveBeenCalled();
  });

  it("multiple handlers run in sequence, passing event forward", async () => {
    const reg = getHookRegistry();
    reg.register("before_tool_call", async (e) => ({
      ...e, data: { ...e.data, step: 1 },
    }));
    reg.register("before_tool_call", async (e) => ({
      ...e, data: { ...e.data, step: 2 },
    }));
    const result = await reg.emit("before_tool_call", makeEvent());
    expect(result?.data.step).toBe(2);
  });

  it("after_tool_call handler can modify result", async () => {
    const reg = getHookRegistry();
    reg.register("after_tool_call", async (e) => ({
      ...e,
      data: { ...e.data, result: "overridden" },
    }));
    const event: HookEvent = {
      ...makeEvent(),
      data: { toolName: "read", toolInput: {}, toolUseId: "x", result: "original" },
    };
    const result = await reg.emit("after_tool_call", event);
    expect(result?.data.result).toBe("overridden");
  });

  it("handlers for different events are isolated", async () => {
    const reg = getHookRegistry();
    const handler = vi.fn(async (e: HookEvent) => e);
    reg.register("before_llm_call", handler);
    await reg.emit("before_tool_call", makeEvent());
    expect(handler).not.toHaveBeenCalled();
  });

  it("resetHookRegistry clears all handlers", async () => {
    const reg = getHookRegistry();
    const handler = vi.fn(async (e: HookEvent) => e);
    reg.register("before_tool_call", handler);
    resetHookRegistry();
    await getHookRegistry().emit("before_tool_call", makeEvent());
    expect(handler).not.toHaveBeenCalled();
  });

  it("unregister removes handlers for a type", async () => {
    const reg = getHookRegistry();
    const handler = vi.fn(async (e: HookEvent) => e);
    reg.register("before_tool_call", handler);
    reg.unregister("before_tool_call");
    await reg.emit("before_tool_call", makeEvent());
    expect(handler).not.toHaveBeenCalled();
  });
});
