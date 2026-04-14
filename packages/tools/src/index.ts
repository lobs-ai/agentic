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

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  ToolDefinition,
  ToolExecutorResult,
  ToolSideEffects,
  ToolExecutor,
  ToolEntry,
} from "./types.js";

// ── Utilities ────────────────────────────────────────────────────────────────
export { capOutput } from "./output-cap.js";
export { resolveToCwd } from "./path-utils.js";

// ── Read snapshot helpers ─────────────────────────────────────────────────────
export {
  createReadSnapshot,
  hasRecentlyReadFile,
  updateReadSnapshot,
  getReadSnapshot,
} from "./read.js";

// ── Tools ────────────────────────────────────────────────────────────────────
export { readToolDefinition, readTool } from "./read.js";
export { writeToolDefinition, writeTool } from "./write.js";
export { editToolDefinition, editTool } from "./edit.js";
export { execToolDefinition, execTool } from "./exec.js";
export { lsToolDefinition, lsTool } from "./ls.js";
export { grepToolDefinition, grepTool } from "./grep.js";
export { globToolDefinition, globTool } from "./glob.js";
export { findFilesToolDefinition, findFilesTool } from "./find-files.js";
export { codeSearchToolDefinition, codeSearchTool } from "./code-search.js";

// ── Tool registry helpers ────────────────────────────────────────────────────
import type { ToolEntry } from "./types.js";
import { readToolDefinition, readTool } from "./read.js";
import { writeToolDefinition, writeTool } from "./write.js";
import { editToolDefinition, editTool } from "./edit.js";
import { execToolDefinition, execTool } from "./exec.js";
import { lsToolDefinition, lsTool } from "./ls.js";
import { grepToolDefinition, grepTool } from "./grep.js";
import { globToolDefinition, globTool } from "./glob.js";
import { findFilesToolDefinition, findFilesTool } from "./find-files.js";
import { codeSearchToolDefinition, codeSearchTool } from "./code-search.js";

/**
 * All built-in tool entries as a flat array.
 * Useful for registering them all with an agent runner.
 */
export const ALL_TOOLS: ToolEntry[] = [
  { definition: readToolDefinition, executor: readTool },
  { definition: writeToolDefinition, executor: writeTool },
  { definition: editToolDefinition, executor: editTool },
  { definition: execToolDefinition, executor: execTool },
  { definition: lsToolDefinition, executor: lsTool },
  { definition: grepToolDefinition, executor: grepTool },
  { definition: globToolDefinition, executor: globTool },
  { definition: findFilesToolDefinition, executor: findFilesTool },
  { definition: codeSearchToolDefinition, executor: codeSearchTool },
];

/**
 * All tool definitions (for passing to the Anthropic API).
 */
export const ALL_TOOL_DEFINITIONS = ALL_TOOLS.map((t) => t.definition);

/**
 * Execute a tool by name.
 *
 * @param name   Tool name (e.g. "read", "exec")
 * @param params Tool parameters
 * @param cwd    Working directory for the tool
 * @returns      Tool result string or structured result with side effects
 * @throws       If the tool name is not found
 */
export async function executeTool(
  name: string,
  params: Record<string, unknown>,
  cwd: string,
) {
  const entry = ALL_TOOLS.find((t) => t.definition.name === name);
  if (!entry) throw new Error(`Unknown tool: ${name}`);
  return entry.executor(params, cwd);
}
