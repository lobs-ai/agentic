import { describe, it, expect } from "vitest";
import { PromptBuilder } from "agentic";

describe("PromptBuilder", () => {
  it("build() on empty builder returns empty string", () => {
    expect(new PromptBuilder().build()).toBe("");
  });

  it("role() places description first regardless of call order", () => {
    const result = new PromptBuilder()
      .section("Rules", "be nice")
      .role("You are a helpful assistant.")
      .build();
    expect(result.startsWith("You are a helpful assistant.")).toBe(true);
  });

  it("section() adds ## heading", () => {
    const result = new PromptBuilder().section("Context", "Some context.").build();
    expect(result).toContain("## Context");
    expect(result).toContain("Some context.");
  });

  it("section() accepts string array content", () => {
    const result = new PromptBuilder()
      .section("Notes", ["line one", "line two"])
      .build();
    expect(result).toContain("line one");
    expect(result).toContain("line two");
  });

  it("rules() creates a bulleted list under ## Rules", () => {
    const result = new PromptBuilder()
      .rules(["Read first.", "Verify after."])
      .build();
    expect(result).toContain("## Rules");
    expect(result).toContain("- Read first.");
    expect(result).toContain("- Verify after.");
  });

  it("context() creates a <context> block with JSON", () => {
    const result = new PromptBuilder()
      .context({ userId: "u1", role: "admin" })
      .build();
    expect(result).toContain("<context>");
    expect(result).toContain("</context>");
    expect(result).toContain('"userId"');
    expect(result).toContain('"u1"');
  });

  it("block() creates a custom tagged block", () => {
    const result = new PromptBuilder().block("task", "Do the thing.").build();
    expect(result).toContain("<task>");
    expect(result).toContain("Do the thing.");
    expect(result).toContain("</task>");
  });

  it("examples() creates numbered examples", () => {
    const result = new PromptBuilder()
      .examples([
        { input: "What is 2+2?", output: "4" },
        { input: "Summarize X.", output: "X is about Y." },
      ])
      .build();
    expect(result).toContain("Example 1");
    expect(result).toContain("Example 2");
    expect(result).toContain("What is 2+2?");
    expect(result).toContain("X is about Y.");
  });

  it("raw() appends text verbatim", () => {
    const result = new PromptBuilder().raw("  raw content  ").build();
    expect(result).toBe("raw content");
  });

  it("parts are joined with double newlines", () => {
    const result = new PromptBuilder()
      .role("Role.")
      .section("A", "a body")
      .section("B", "b body")
      .build();
    expect(result).toMatch(/Role\.\n\n## A/);
    expect(result).toMatch(/a body\n\n## B/);
  });

  it("toString() equals build()", () => {
    const b = new PromptBuilder().role("X").section("Y", "Z");
    expect(b.toString()).toBe(b.build());
  });

  it("from() starts with provided base text", () => {
    const result = PromptBuilder.from("base text").section("Extra", "more").build();
    expect(result.startsWith("base text")).toBe(true);
    expect(result).toContain("Extra");
  });

  it("chaining returns the same instance", () => {
    const b = new PromptBuilder();
    expect(b.role("x")).toBe(b);
    expect(b.section("S", "c")).toBe(b);
    expect(b.rules(["r"])).toBe(b);
    expect(b.raw("r")).toBe(b);
  });
});
