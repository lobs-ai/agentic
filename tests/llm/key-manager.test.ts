import { describe, it, expect, beforeEach } from "vitest";
import { KeyManager } from "@agentic/llm";

function makeManager(keys: string[]) {
  return new KeyManager({
    anthropic: {
      keys: keys.map((k, i) => ({ key: k, label: `key-${i}` })),
    },
  });
}

describe("KeyManager", () => {
  it("returns null when no keys configured", () => {
    const km = new KeyManager();
    expect(km.getAuth("anthropic", "s1")).toBeNull();
  });

  it("returns auth for a single key", () => {
    const km = makeManager(["sk-ant-1"]);
    const auth = km.getAuth("anthropic", "s1");
    expect(auth).not.toBeNull();
    expect(auth!.apiKey).toBe("sk-ant-1");
  });

  it("detects OAuth token (sk-ant-oat prefix)", () => {
    const km = makeManager(["sk-ant-oat-mytoken"]);
    const auth = km.getAuth("anthropic", "s1");
    expect(auth!.isOAuth).toBe(true);
    expect(auth!.authToken).toBe("sk-ant-oat-mytoken");
    expect(auth!.apiKey).toBeUndefined();
  });

  it("returns null for unknown provider", () => {
    const km = makeManager(["sk-1"]);
    expect(km.getAuth("openai", "s1")).toBeNull();
  });

  it("hasKeys returns true when keys configured", () => {
    const km = makeManager(["sk-1"]);
    expect(km.hasKeys("anthropic")).toBe(true);
  });

  it("hasKeys returns false when no keys", () => {
    expect(new KeyManager().hasKeys("anthropic")).toBe(false);
  });

  describe("session stickiness", () => {
    it("same session always gets the same key", () => {
      const km = makeManager(["sk-1", "sk-2", "sk-3"]);
      const first = km.getAuth("anthropic", "sess-a")!.apiKey;
      const second = km.getAuth("anthropic", "sess-a")!.apiKey;
      expect(first).toBe(second);
    });

    it("different sessions may get different keys", () => {
      const km = makeManager(["sk-1", "sk-2"]);
      const a = km.getAuth("anthropic", "sess-a")!.apiKey;
      const b = km.getAuth("anthropic", "sess-b")!.apiKey;
      // With 2 keys and 2 sessions, they should be distributed
      // (not guaranteed to differ, but at least both are valid keys)
      expect(["sk-1", "sk-2"]).toContain(a);
      expect(["sk-1", "sk-2"]).toContain(b);
    });
  });

  describe("failure handling", () => {
    it("markFailed unhealthy key is skipped", () => {
      const km = makeManager(["sk-bad", "sk-good"]);
      const auth1 = km.getAuth("anthropic", "s1")!;
      km.markFailed("anthropic", auth1.keyIndex!, "test", "rate_limit", 999_999_000);
      const auth2 = km.getAuth("anthropic", "s2")!;
      expect(auth2.apiKey).not.toBe(auth1.apiKey);
    });

    it("returns null when all keys unhealthy", () => {
      const km = makeManager(["sk-1"]);
      km.markFailed("anthropic", 0, "test", "auth");
      expect(km.getAuth("anthropic", "s1")).toBeNull();
    });

    it("markHealthy re-enables a failed key", () => {
      const km = makeManager(["sk-1"]);
      km.markFailed("anthropic", 0, "test", "auth");
      expect(km.getAuth("anthropic", "s1")).toBeNull();
      km.markHealthy("anthropic", 0);
      expect(km.getAuth("anthropic", "s1")).not.toBeNull();
    });
  });

  describe("getKeySelection", () => {
    it("returns key string without auth wrapping", () => {
      const km = makeManager(["sk-raw"]);
      const sel = km.getKeySelection("anthropic", "s1");
      expect(sel).not.toBeNull();
      expect(sel!.key).toBe("sk-raw");
    });
  });

  describe("getPoolHealthSummary", () => {
    it("reports healthy count correctly", () => {
      const km = makeManager(["sk-1", "sk-2"]);
      const summary = km.getPoolHealthSummary("anthropic");
      expect(summary.total).toBe(2);
      expect(summary.healthy).toBe(2);
    });

    it("reports authFailed count", () => {
      const km = makeManager(["sk-1", "sk-2"]);
      km.markFailed("anthropic", 0, "bad auth", "auth");
      const summary = km.getPoolHealthSummary("anthropic");
      expect(summary.authFailed).toBe(1);
      expect(summary.healthy).toBe(1);
    });

    it("returns zeros for unknown provider", () => {
      const km = new KeyManager();
      const summary = km.getPoolHealthSummary("nope");
      expect(summary).toEqual({ total: 0, healthy: 0, authFailed: 0, rateLimited: 0, providerFailed: 0 });
    });
  });

  describe("in-flight tracking", () => {
    it("trackRequestStart/End does not crash", () => {
      const km = makeManager(["sk-1"]);
      expect(() => {
        km.trackRequestStart("anthropic", 0);
        km.trackRequestEnd("anthropic", 0, true);
      }).not.toThrow();
    });
  });

  describe("configure()", () => {
    it("replaces pool on re-configure", () => {
      const km = makeManager(["sk-old"]);
      km.configure({ anthropic: { keys: [{ key: "sk-new" }] } });
      const auth = km.getAuth("anthropic", "s1");
      expect(auth!.apiKey).toBe("sk-new");
    });
  });
});
