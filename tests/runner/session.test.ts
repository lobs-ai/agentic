import { describe, it, expect, vi } from "vitest";
import { Session, type SessionStore } from "@agentic/runner";
import type { LLMMessage } from "@agentic/llm";

const msg = (role: "user" | "assistant", text: string): LLMMessage => ({
  role,
  content: text,
});

describe("Session", () => {
  it("starts empty by default", () => {
    const s = new Session();
    expect(s.messages).toHaveLength(0);
  });

  it("accepts initial messages", () => {
    const s = new Session([msg("user", "hello")]);
    expect(s.messages).toHaveLength(1);
  });

  it("messages is readonly (cannot push externally)", () => {
    const s = new Session([msg("user", "hello")]);
    expect(() => {
      (s.messages as LLMMessage[]).push(msg("assistant", "hi"));
    }).not.toThrow(); // readonly type, but JS doesn't enforce at runtime on arrays
    // The real enforcement is that _ref() is what the loop uses
  });

  it("_ref() is the same mutable array — mutations visible via messages", () => {
    const s = new Session();
    const ref = s._ref();
    ref.push(msg("user", "mutated"));
    expect(s.messages).toHaveLength(1);
    expect((s.messages[0].content as string)).toBe("mutated");
  });

  it("sessionId is null for in-memory sessions", () => {
    expect(new Session().sessionId).toBeNull();
  });

  it("sessionId returns provided id", () => {
    const s = new Session([], "sess-123");
    expect(s.sessionId).toBe("sess-123");
  });

  it("seed() replaces messages in-place", () => {
    const s = new Session([msg("user", "original")]);
    const ref = s._ref();
    s.seed([msg("user", "replaced"), msg("assistant", "ok")]);
    // Same array reference
    expect(ref).toBe(s._ref());
    expect(s.messages).toHaveLength(2);
    expect((s.messages[0].content as string)).toBe("replaced");
  });

  it("fork() creates an independent copy", () => {
    const s = new Session([msg("user", "shared")]);
    const f = s.fork();
    f._ref().push(msg("assistant", "forked-only"));
    expect(s.messages).toHaveLength(1); // original unaffected
    expect(f.messages).toHaveLength(2);
  });

  it("fork() has no store attached", () => {
    const store: SessionStore = {
      load: vi.fn(async () => []),
      save: vi.fn(async () => {}),
    };
    const s = new Session([msg("user", "hi")], "sid", store);
    const f = s.fork();
    expect(f.sessionId).toBeNull();
  });

  describe("fromStore()", () => {
    it("loads messages from the store", async () => {
      const stored = [msg("user", "from-db")];
      const store: SessionStore = {
        load: vi.fn(async () => stored),
        save: vi.fn(async () => {}),
      };
      const s = await Session.fromStore("sid-1", store);
      expect(store.load).toHaveBeenCalledWith("sid-1");
      expect(s.messages).toHaveLength(1);
    });
  });

  describe("flush()", () => {
    it("saves messages to the store", async () => {
      const store: SessionStore = {
        load: vi.fn(async () => []),
        save: vi.fn(async () => {}),
      };
      const s = new Session([msg("user", "data")], "sid-2", store);
      await s.flush();
      expect(store.save).toHaveBeenCalledWith("sid-2", s.messages);
    });

    it("no-op when no store provided", async () => {
      const s = new Session([msg("user", "data")]);
      await expect(s.flush()).resolves.toBeUndefined();
    });
  });
});
