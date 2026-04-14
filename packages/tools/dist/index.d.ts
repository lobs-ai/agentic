/**
 * @agentic/tools — standalone tool implementations for AI agents.
 *
 * Each tool exports:
 *   - A `*ToolDefinition` (Anthropic-compatible tool spec)
 *   - An `*Tool(params, cwd)` executor function
 *
 * Usage:
 *   import { readTool, readToolDefinition } from "@agentic/tools";
 *   const result = await readTool({ file_path: "/some/file.ts" }, process.cwd());
 */
export type { ToolDefinition, ToolExecutorResult, ToolSideEffects, ToolExecutor, ToolEntry, } from "./types.js";
export { capOutput } from "./output-cap.js";
export { resolveToCwd } from "./path-utils.js";
export { createReadSnapshot, hasRecentlyReadFile, updateReadSnapshot, getReadSnapshot, } from "./read.js";
export { readToolDefinition, readTool } from "./read.js";
export { writeToolDefinition, writeTool } from "./write.js";
export { editToolDefinition, editTool } from "./edit.js";
export { execToolDefinition, execTool } from "./exec.js";
export { lsToolDefinition, lsTool } from "./ls.js";
export { grepToolDefinition, grepTool } from "./grep.js";
export { globToolDefinition, globTool } from "./glob.js";
export { findFilesToolDefinition, findFilesTool } from "./find-files.js";
export { codeSearchToolDefinition, codeSearchTool } from "./code-search.js";
import type { ToolEntry } from "./types.js";
/**
 * All built-in tool entries as a flat array.
 * Useful for registering them all with an agent runner.
 */
export declare const ALL_TOOLS: ToolEntry[];
/**
 * All tool definitions (for passing to the Anthropic API).
 */
export declare const ALL_TOOL_DEFINITIONS: import("./types.js").ToolDefinition[];
/**
 * Execute a tool by name.
 *
 * @param name   Tool name (e.g. "read", "exec")
 * @param params Tool parameters
 * @param cwd    Working directory for the tool
 * @returns      Tool result string or structured result with side effects
 * @throws       If the tool name is not found
 */
export declare function executeTool(name: string, params: Record<string, unknown>, cwd: string): Promise<import("./types.js").ToolExecutorResult>;
//# sourceMappingURL=index.d.ts.map