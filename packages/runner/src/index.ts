/**
 * @agentic/runner — public API
 *
 * The standalone agent execution loop package.
 *
 * Quick start:
 *   import { Agent } from "@agentic/runner";
 *   import { defaultRegistry } from "@agentic/tools";
 *
 *   const result = await new Agent({
 *     model: "claude-sonnet-4-6",
 *     cwd: process.cwd(),
 *     timeout: 300,
 *     toolRegistry: defaultRegistry,
 *   }).run("Summarize the codebase.");
 */

// ── Agent class (high-level API) ──────────────────────────────────────────────
export { Agent } from "./agent.js";
export type { AgentConfig } from "./agent.js";

// ── Session ───────────────────────────────────────────────────────────────────
export { Session } from "./session.js";
export type { SessionStore } from "./session.js";

// ── Core loop (low-level API) ─────────────────────────────────────────────────
export { runAgent } from "./agent-loop.js";

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  AgentSpec,
  AgentResult,
  AgentContext,
  AgentPhase,
  TokenUsage,
  ToolResult,
  ToolExecutor,
  ProgressUpdate,
  RunnerToolDefinition,
  TimeoutConfig,
  TimeoutInput,
} from "./types.js";
export { MODEL_COSTS, normalizeTimeout } from "./types.js";

// ── Hook registry ─────────────────────────────────────────────────────────────
export {
  getHookRegistry,
  resetHookRegistry,
  HookRegistry,
} from "./hooks.js";
export type { HookEvent, HookEventType, HookHandler } from "./hooks.js";

// ── Loop detector ─────────────────────────────────────────────────────────────
export { LoopDetector } from "./loop-detector.js";
export type { LoopDetectionResult } from "./loop-detector.js";

// ── Context engine (pluggable) ────────────────────────────────────────────────
export {
  TruncatingContextEngine,
  NoopContextEngine,
  defaultContextEngine,
} from "./context-engine.js";
export type { ContextEngine } from "./context-engine.js";

// ── Context management (low-level helpers) ────────────────────────────────────
export {
  getContextLimit,
  estimateTokens,
  shouldCompact,
  compactMessages,
} from "./context-manager.js";

// ── Session transcript ────────────────────────────────────────────────────────
export { SessionTranscript } from "./session-transcript.js";
export type { TurnRecord, SessionSummary } from "./session-transcript.js";

// ── Tool registry ─────────────────────────────────────────────────────────────
export {
  registerTool,
  getToolDefinitions,
  executeTool,
} from "./tool-registry.js";
export type { ToolEntry } from "./tool-registry.js";
