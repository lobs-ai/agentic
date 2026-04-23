/**
 * @agentic/tools — standalone tool implementations for AI agents.
 *
 * Class-based API (recommended):
 *   import { ToolRegistry, ReadTool, ExecTool } from "@agentic/tools";
 *   const registry = new ToolRegistry().register(new ReadTool()).register(new ExecTool());
 *
 * Pre-built registry with all built-ins:
 *   import { defaultRegistry } from "@agentic/tools";
 *
 * Legacy functional API (backward compat):
 *   import { readTool, readToolDefinition } from "@agentic/tools";
 */

// ── Core abstractions ────────────────────────────────────────────────────────
export { BaseTool } from "./base-tool.js";
export type { ToolContext, ToolInputSchema } from "./base-tool.js";

// ── Registry ─────────────────────────────────────────────────────────────────
export { ToolRegistry } from "./registry.js";

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  ToolDefinition,
  ToolExecutorResult,
  ToolSideEffects,
  ToolExecutor,
  ToolEntry,
} from "./types.js";

// ── Utilities ────────────────────────────────────────────────────────────────
export { capOutput, DEFAULT_OUTPUT_CAP, DEFAULT_MAX_LINES } from "./output-cap.js";
export { resolveToCwd } from "./path-utils.js";

// ── Read snapshot helpers ─────────────────────────────────────────────────────
export {
  createReadSnapshot,
  hasRecentlyReadFile,
  updateReadSnapshot,
  getReadSnapshot,
  clearRecentReadTracking,
} from "./read.js";
export type { ReadSnapshot } from "./read.js";

// ── Tool class instances ─────────────────────────────────────────────────────
export { ReadTool, readToolDefinition, readTool } from "./read.js";
export { WriteTool, writeToolDefinition, writeTool } from "./write.js";
export { EditTool, editToolDefinition, editTool } from "./edit.js";
export { ExecTool, execToolDefinition, execTool } from "./exec.js";
export { LsTool, lsToolDefinition, lsTool } from "./ls.js";
export { GrepTool, grepToolDefinition, grepTool } from "./grep.js";
export { GlobTool, globToolDefinition, globTool } from "./glob.js";
export { FindFilesTool, findFilesToolDefinition, findFilesTool } from "./find-files.js";
export { CodeSearchTool, codeSearchToolDefinition, codeSearchTool } from "./code-search.js";
export { WebSearchTool, webSearchToolDefinition, webSearchTool } from "./web-search.js";
export type { WebSearchToolOptions } from "./web-search.js";
export { WebFetchTool, webFetchToolDefinition, webFetchTool } from "./web-fetch.js";
export type { WebFetchToolOptions } from "./web-fetch.js";
export { BrowserService, browserService, setupSearXNG } from "./browser-service.js";
export type { BrowserServiceOptions, SearchResult, FetchResult } from "./browser-service.js";
export type { ExecToolOptions } from "./exec.js";

// ── PowerPoint tools ──────────────────────────────────────────────────────────
export {
  PptxCreateTool,
  PptxAddSlideTool,
  PptxAddTextTool,
  PptxAddImageTool,
  PptxAddShapeTool,
  PptxAddTableTool,
  PptxAddChartTool,
  PptxSaveTool,
  PPTX_TOOLS,
} from "./pptx.js";

// ── HTML → PDF ────────────────────────────────────────────────────────────────
export {
  HtmlToPdfTool,
  htmlToPdfTool,
  HtmlCheckTool,
  htmlCheckTool,
  HtmlStyleGuideTool,
  htmlStyleGuideTool,
  parseLengthToPx,
  parseMargins,
  parsePaper,
  gatherDiagnostics,
  PRESETS,
  PRESET_NAMES,
  themeCss,
  injectStyle,
} from "./html-to-pdf.js";
export type { HtmlDiagnostics, HtmlOverflowItem, HtmlBrokenImage, ThemeName } from "./html-to-pdf.js";

// ── Built-in tool instances ───────────────────────────────────────────────────
import { ReadTool } from "./read.js";
import { WriteTool } from "./write.js";
import { EditTool } from "./edit.js";
import { ExecTool } from "./exec.js";
import { LsTool } from "./ls.js";
import { GrepTool } from "./grep.js";
import { GlobTool } from "./glob.js";
import { FindFilesTool } from "./find-files.js";
import { CodeSearchTool } from "./code-search.js";
import { HtmlToPdfTool, HtmlCheckTool, HtmlStyleGuideTool } from "./html-to-pdf.js";
import { ToolRegistry } from "./registry.js";
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

/** All built-in tool class instances. */
export const BUILTIN_TOOLS = [
  new ReadTool(),
  new WriteTool(),
  new EditTool(),
  new ExecTool(),
  new LsTool(),
  new GrepTool(),
  new GlobTool(),
  new FindFilesTool(),
  new CodeSearchTool(),
  new HtmlToPdfTool(),
  new HtmlCheckTool(),
  new HtmlStyleGuideTool(),
] as const;

/**
 * Default registry pre-loaded with all built-in tools.
 * Pass to `AgentSpec.toolRegistry` or use directly.
 */
export const defaultRegistry = new ToolRegistry().registerAll([...BUILTIN_TOOLS]);

// ── Legacy flat-array API (backward compat) ───────────────────────────────────

/** All built-in tool entries as a flat array. */
export const ALL_TOOLS: ToolEntry[] = [
  { definition: readToolDefinition, executor: readTool },
  { definition: writeToolDefinition, executor: writeTool },
  { definition: editToolDefinition, executor: editTool },
  { definition: execToolDefinition, executor: (params, cwd) => execTool(params, cwd) },
  { definition: lsToolDefinition, executor: lsTool },
  { definition: grepToolDefinition, executor: grepTool },
  { definition: globToolDefinition, executor: globTool },
  { definition: findFilesToolDefinition, executor: findFilesTool },
  { definition: codeSearchToolDefinition, executor: codeSearchTool },
];

/** All tool definitions (for passing to the Anthropic API). */
export const ALL_TOOL_DEFINITIONS = ALL_TOOLS.map((t) => t.definition);

/**
 * Execute a tool by name using the default registry.
 * Throws if the tool name is not found.
 */
export async function executeTool(
  name: string,
  params: Record<string, unknown>,
  cwd: string,
) {
  return defaultRegistry.execute(name, params, cwd);
}
