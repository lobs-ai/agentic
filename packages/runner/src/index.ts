/**
 * @agentic/runner — public API
 *
 * The standalone agent execution loop package.
 * Import `runAgent` and provide an `AgentSpec` to run an agent.
 */

// ── Core loop ─────────────────────────────────────────────────────────────────
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
} from "./types.js";
export { MODEL_COSTS } from "./types.js";

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

// ── Context management ────────────────────────────────────────────────────────
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
