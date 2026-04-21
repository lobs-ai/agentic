/**
 * agentic — one-install agent runtime for Node.js.
 *
 * @example Minimal usage
 * ```ts
 * import { AgenticRuntime } from "agentic";
 *
 * // Reads agentic.yaml (or agentic.config.ts) from cwd
 * const rt = await AgenticRuntime.fromConfig();
 *
 * const result = await rt.agent({
 *   model: "claude-sonnet-4-6",
 *   cwd: process.cwd(),
 *   timeout: 300,
 * }).run("Summarize the codebase.");
 *
 * console.log(result.output);
 * ```
 *
 * @example Config management
 * ```ts
 * import { ConfigStore } from "agentic";
 *
 * const store = await ConfigStore.load();
 * store
 *   .addKey("anthropic", process.env.ANTHROPIC_API_KEY!, "primary")
 *   .setFallback("anthropic", ["openai/gpt-4o"])
 *   .setDefaultModel("claude-sonnet-4-6");
 * await store.save();
 * ```
 *
 * @example Custom tool in a file — set `tools.dirs: ["./tools"]` in config:
 * ```ts
 * // tools/hello.ts
 * import { BaseTool } from "agentic";
 * export default class HelloTool extends BaseTool {
 *   name = "hello";
 *   description = "Greets a user by name.";
 *   inputSchema = { type: "object", properties: { name: { type: "string" } }, required: ["name"] };
 *   async run({ name }: { name: string }) { return `Hello, ${name}!`; }
 * }
 * ```
 */

// ── Runtime ───────────────────────────────────────────────────────────────────
export { AgenticRuntime } from "./runtime.js";

// ── Config management ─────────────────────────────────────────────────────────
export { ConfigStore } from "./config-store.js";

// ── Config types ──────────────────────────────────────────────────────────────
export type {
  AgenticConfig,
  ContextEngineConfig,
  AgentDefaults,
  ToolsConfig,
  ToolDirEntry,
  ProviderConfig,
  ResilienceConfig,
  KeyEntry,
  KeyRotation,
  ToolSelector,
} from "./types.js";

// ── Utilities ─────────────────────────────────────────────────────────────────
export { discoverTools, loadToolFile } from "./discover.js";
export { createContextEngine } from "./context-factory.js";
export { buildCustomClient } from "./provider-factory.js";
export { loadConfigFile, findConfigFile, parseConfigFile, interpolate } from "./config-loader.js";
export { PromptBuilder } from "./prompt-builder.js";
export { parseJsonOutput, extract } from "./output.js";
export type { ExtractOptions } from "./output.js";

// ── Re-export the full sub-package APIs ───────────────────────────────────────
// Users can do `import { BaseTool, Agent, createClient } from "agentic"`
// without knowing which sub-package each lives in.

// @agentic/tools
export {
  BaseTool,
  ToolRegistry,
  BUILTIN_TOOLS,
  defaultRegistry,
  ALL_TOOLS,
  ALL_TOOL_DEFINITIONS,
  executeTool,
  ReadTool,
  WriteTool,
  EditTool,
  ExecTool,
  LsTool,
  GrepTool,
  GlobTool,
  FindFilesTool,
  CodeSearchTool,
  capOutput,
  resolveToCwd,
  clearRecentReadTracking,
  createReadSnapshot,
  hasRecentlyReadFile,
  updateReadSnapshot,
  getReadSnapshot,
} from "@agentic/tools";
export type {
  ToolDefinition,
  ToolExecutorResult,
  ToolSideEffects,
  ToolExecutor,
  ToolEntry,
  ToolContext,
  ToolInputSchema,
  ReadSnapshot,
} from "@agentic/tools";

// @agentic/runner
export {
  runAgent,
  Agent,
  Session,
  TruncatingContextEngine,
  NoopContextEngine,
  defaultContextEngine,
  getHookRegistry,
  resetHookRegistry,
  HookRegistry,
  LoopDetector,
  getContextLimit,
  estimateTokens,
  shouldCompact,
  compactMessages,
  SessionTranscript,
  MODEL_COSTS,
} from "@agentic/runner";
export type {
  AgentSpec,
  AgentResult,
  AgentConfig,
  AgentContext,
  AgentPhase,
  TokenUsage,
  ToolResult,
  ProgressUpdate,
  ContextEngine,
  HookEvent,
  HookEventType,
  HookHandler,
  LoopDetectionResult,
  TurnRecord,
  SessionSummary,
  SessionStore,
} from "@agentic/runner";

// @agentic/llm
export {
  createClient,
  createResilientClient,
  inferProvider,
  parseModelString,
  AnthropicClient,
  OpenAIClient,
  OpenAICompatibleClient,
  buildCompatibleClient,
  ResilientLLMClient,
  KNOWN_ENDPOINTS,
  MODELS,
  FALLBACK_CHAINS,
  getModelInfo,
  getModelsByTier,
  estimateCost,
  CircuitBreaker,
  KeyManager,
  getKeyManager,
  configureKeyManager,
} from "@agentic/llm";
export type {
  LLMClient,
  LLMMessage,
  LLMResponse,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  CreateMessageParams,
  Provider,
  // ProviderConfig from @agentic/llm is an internal resolved pair — not re-exported
  // to avoid naming conflict with AgenticConfig.ProviderConfig (agentic/src/types.ts).
  TokenUsage as LLMTokenUsage,
  StopReason,
  ThinkingConfig,
  ClientConfig,
  ResilientClientOptions,
  ModelInfo,
  ModelTier,
} from "@agentic/llm";
