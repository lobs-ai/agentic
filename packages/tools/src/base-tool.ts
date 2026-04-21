/**
 * BaseTool — abstract base class for all tools.
 *
 * Extend this class to create a tool. Override `name`, `description`,
 * `inputSchema`, and `run()`. The `definition` and `toEntry()` members
 * are derived automatically.
 *
 * @example
 * ```ts
 * class MyTool extends BaseTool {
 *   name = "my_tool";
 *   description = "Does something useful.";
 *   inputSchema = {
 *     type: "object" as const,
 *     properties: { value: { type: "string" } },
 *     required: ["value"],
 *   };
 *   async run({ value }: { value: string }, ctx: ToolContext) {
 *     return `got: ${value} in ${ctx.cwd}`;
 *   }
 * }
 *
 * registry.register(new MyTool());
 * ```
 */

import type { ToolDefinition, ToolExecutorResult } from "./types.js";

/** Context passed to every tool invocation. */
export interface ToolContext {
  /** The working directory of the agent at call time. */
  cwd: string;
}

/** Input schema — JSON Schema object descriptor for the tool's input. */
export interface ToolInputSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export abstract class BaseTool<
  TInput extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Tool name — must be unique within a registry. */
  abstract readonly name: string;
  /** Human-readable description shown to the LLM. */
  abstract readonly description: string;
  /** JSON Schema for the tool's input parameters. */
  abstract readonly inputSchema: ToolInputSchema;

  /** Execute the tool. Errors should be thrown — the registry catches them. */
  abstract run(input: TInput, context: ToolContext): Promise<ToolExecutorResult>;

  /** Full `ToolDefinition` derived from name / description / inputSchema. */
  get definition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      input_schema: this.inputSchema,
    };
  }

  /** Convert to a `ToolEntry` for use with `ToolRegistry` or legacy registries. */
  toEntry() {
    return {
      definition: this.definition,
      executor: (params: Record<string, unknown>, cwd: string) =>
        this.run(params as TInput, { cwd }),
    };
  }
}
