/**
 * Core types for @agentic/tools
 */

/** Anthropic-compatible tool definition */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema object descriptor. Must include `type: "object"`. */
  input_schema: { type: "object"; [key: string]: unknown };
}

/** Result from a tool executor — either a plain string or a structured result with optional side effects */
export type ToolExecutorResult =
  | string
  | { result: string; sideEffects?: ToolSideEffects };

/** Side effects a tool can communicate back to the runner */
export interface ToolSideEffects {
  /** New working directory after a `cd` or workdir change */
  newCwd?: string;
}

/** Function signature for tool execution */
export type ToolExecutor = (
  params: Record<string, unknown>,
  cwd: string,
) => Promise<ToolExecutorResult>;

/** A registered tool entry */
export interface ToolEntry {
  definition: ToolDefinition;
  executor: ToolExecutor;
}
