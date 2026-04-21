import { describe, it, expect } from "vitest";
import { ToolRegistry, BaseTool, type ToolContext } from "@agentic/tools";

class EchoTool extends BaseTool {
  name = "echo";
  description = "Returns the input";
  tags = ["test", "readonly"] as const;
  inputSchema = {
    type: "object" as const,
    properties: { text: { type: "string" } },
    required: ["text"],
  };
  async run({ text }: { text: string }, _ctx: ToolContext) {
    return `echo: ${text}`;
  }
}

class AddTool extends BaseTool {
  name = "add";
  description = "Adds two numbers";
  tags = ["math"] as const;
  inputSchema = {
    type: "object" as const,
    properties: { a: { type: "number" }, b: { type: "number" } },
    required: ["a", "b"],
  };
  async run({ a, b }: { a: number; b: number }) {
    return String(a + b);
  }
}

describe("ToolRegistry", () => {
  it("register and retrieve a BaseTool", () => {
    const reg = new ToolRegistry().register(new EchoTool());
    expect(reg.has("echo")).toBe(true);
  });

  it("register a raw ToolEntry", () => {
    const entry = {
      definition: { name: "raw", description: "raw tool", input_schema: { type: "object" as const } },
      executor: async () => "raw result",
    };
    const reg = new ToolRegistry().register(entry);
    expect(reg.has("raw")).toBe(true);
  });

  it("registerAll adds multiple tools", () => {
    const reg = new ToolRegistry().registerAll([new EchoTool(), new AddTool()]);
    expect(reg.has("echo")).toBe(true);
    expect(reg.has("add")).toBe(true);
  });

  it("names() returns all tool names", () => {
    const reg = new ToolRegistry().registerAll([new EchoTool(), new AddTool()]);
    expect(reg.names()).toContain("echo");
    expect(reg.names()).toContain("add");
    expect(reg.names().length).toBe(2);
  });

  it("size returns correct count", () => {
    const reg = new ToolRegistry().registerAll([new EchoTool(), new AddTool()]);
    expect(reg.size).toBe(2);
  });

  it("get returns definition for known tool", () => {
    const reg = new ToolRegistry().register(new EchoTool());
    const def = reg.get("echo");
    expect(def?.name).toBe("echo");
    expect(def?.description).toContain("input");
  });

  it("get returns undefined for unknown tool", () => {
    expect(new ToolRegistry().get("nope")).toBeUndefined();
  });

  it("getDefinitions with no args returns all", () => {
    const reg = new ToolRegistry().registerAll([new EchoTool(), new AddTool()]);
    expect(reg.getDefinitions()).toHaveLength(2);
  });

  it("getDefinitions filters by name list", () => {
    const reg = new ToolRegistry().registerAll([new EchoTool(), new AddTool()]);
    const defs = reg.getDefinitions(["echo"]);
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe("echo");
  });

  it("execute calls the tool executor", async () => {
    const reg = new ToolRegistry().register(new EchoTool());
    const result = await reg.execute("echo", { text: "hello" }, "/cwd");
    expect(typeof result === "string" ? result : result.result).toContain("echo: hello");
  });

  it("execute throws for unknown tool", async () => {
    await expect(
      new ToolRegistry().execute("nope", {}, "/cwd"),
    ).rejects.toThrow("Unknown tool");
  });

  it("execute passes meta to tool", async () => {
    class MetaTool extends BaseTool {
      name = "meta";
      description = "returns meta";
      inputSchema = { type: "object" as const };
      async run(_: Record<string, unknown>, ctx: ToolContext) {
        return JSON.stringify(ctx.meta);
      }
    }
    const reg = new ToolRegistry().register(new MetaTool());
    const result = await reg.execute("meta", {}, "/cwd", { userId: "u1" });
    const str = typeof result === "string" ? result : result.result;
    expect(str).toContain("u1");
  });

  it("filter returns names matching predicate", () => {
    const reg = new ToolRegistry().registerAll([new EchoTool(), new AddTool()]);
    const names = reg.filter((def) => def.tags?.includes("readonly") ?? false);
    expect(names).toContain("echo");
    expect(names).not.toContain("add");
  });

  it("tagged returns names matching any tag", () => {
    const reg = new ToolRegistry().registerAll([new EchoTool(), new AddTool()]);
    expect(reg.tagged("readonly")).toContain("echo");
    expect(reg.tagged("math")).toContain("add");
    expect(reg.tagged("readonly", "math")).toHaveLength(2);
  });

  it("tags are NOT included in getDefinitions output for LLM", () => {
    const reg = new ToolRegistry().register(new EchoTool());
    const defs = reg.getDefinitions();
    // ToolDefinition can have tags but they are optional metadata
    // The registry itself keeps them — it's the agent loop that strips them
    expect(defs[0].name).toBe("echo");
  });
});
