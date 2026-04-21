import { describe, it, expect, beforeEach } from "vitest";
import { LoopDetector } from "@agentic/runner";

let detector: LoopDetector;

beforeEach(() => {
  detector = new LoopDetector();
});

function record(name: string, input = {}, output = "ok"): ReturnType<LoopDetector["record"]> {
  return detector.record(name, input, output);
}

describe("LoopDetector", () => {
  it("returns no loop for first calls", () => {
    const r = record("read", { file: "a.txt" });
    expect(r.detected).toBe(false);
  });

  it("returns no loop for varied calls", () => {
    for (let i = 0; i < 10; i++) {
      const r = record("read", { file: `file${i}.txt` }, `content_${i}`);
      expect(r.detected).toBe(false);
    }
  });

  describe("generic repeat", () => {
    it("detects warning after 8 identical calls", () => {
      let result = { detected: false, severity: null as null | string };
      for (let i = 0; i < 8; i++) {
        result = record("read", { file: "same.txt" });
      }
      expect(result.detected).toBe(true);
      expect(result.type).toBe("generic-repeat");
      expect(result.severity).toBe("warning");
    });

    it("resets after reset()", () => {
      for (let i = 0; i < 8; i++) record("read", { file: "same.txt" });
      detector.reset();
      const r = record("read", { file: "same.txt" });
      expect(r.detected).toBe(false);
    });

    it("does NOT detect when inputs vary", () => {
      for (let i = 0; i < 10; i++) {
        const r = record("read", { file: `file${i}.txt` }, `content_${i}`);
        expect(r.detected).toBe(false);
      }
    });
  });

  describe("ping-pong", () => {
    it("detects alternating A/B pattern after 6 calls", () => {
      let last = { detected: false, type: null as null | string };
      for (let i = 0; i < 6; i++) {
        last = record(i % 2 === 0 ? "read" : "write");
      }
      expect(last.detected).toBe(true);
      expect(last.type).toBe("ping-pong");
    });

    it("does NOT detect when same tool repeats (not A/B)", () => {
      for (let i = 0; i < 6; i++) {
        const r = record("read");
        if (i < 5) expect(r.type).not.toBe("ping-pong");
      }
    });
  });

  describe("poll-no-progress", () => {
    it("detects when same tool returns same output 8 times", () => {
      let last = { detected: false, type: null as null | string };
      for (let i = 0; i < 8; i++) {
        last = record("check", { id: i }, "still_pending"); // varied input, same output
      }
      expect(last.detected).toBe(true);
      expect(last.type).toBe("poll-no-progress");
    });

    it("does NOT detect when outputs vary", () => {
      for (let i = 0; i < 10; i++) {
        const r = record("check", { id: i }, `output_${i}`);
        expect(r.detected).toBe(false);
      }
    });
  });
});
