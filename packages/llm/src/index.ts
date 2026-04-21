/**
 * @agentic/llm
 *
 * Unified LLM client for Anthropic, OpenAI, and OpenAI-compatible providers
 * with built-in resilience: retries, fallback chains, key rotation, and
 * circuit breaking.
 *
 * @example Quick start
 * ```ts
 * import { createClient, createResilientClient } from "@agentic/llm";
 *
 * // Simple one-shot call
 * const client = createClient("anthropic/claude-sonnet-4-20250514");
 * const response = await client.createMessage({
 *   model: "claude-sonnet-4-20250514",
 *   system: "You are a helpful assistant.",
 *   messages: [{ role: "user", content: "Hello!" }],
 *   tools: [],
 *   maxTokens: 1024,
 * });
 *
 * // With retries and fallbacks
 * const resilient = createResilientClient(
 *   "anthropic/claude-sonnet-4-20250514",
 *   { fallbackModels: ["openai/gpt-4.1"] },
 * );
 * ```
 */

// ── Core ──────────────────────────────────────────────────────────────────────

export { createClient, parseModelString, inferProvider, KNOWN_ENDPOINTS } from "./client.js";

// ── Utilities ─────────────────────────────────────────────────────────────────

export { stripReasoning } from "./utils.js";

// ── Model Discovery ───────────────────────────────────────────────────────────

export { discoverModels } from "./discover.js";
export type { DiscoveredModel, DiscoverOptions } from "./discover.js";
export {
  createResilientClient,
  ResilientLLMClient,
} from "./resilient-client.js";

// ── Providers ─────────────────────────────────────────────────────────────────

export { AnthropicClient } from "./providers/anthropic.js";
export type { AnthropicClientOptions } from "./providers/anthropic.js";

export { OpenAIClient } from "./providers/openai.js";
export type { OpenAIClientOptions } from "./providers/openai.js";

export {
  OpenAICompatibleClient,
  buildCompatibleClient,
  stripOpenRouterPrefix,
} from "./providers/openai-compatible.js";
export type {
  OpenAICompatibleClientOptions,
  NamedCompatibleOptions,
} from "./providers/openai-compatible.js";

// ── Resilience ────────────────────────────────────────────────────────────────

export {
  CircuitBreaker,
  getCircuitBreaker,
  setCircuitBreaker,
} from "./circuit-breaker.js";

export {
  KeyManager,
  getKeyManager,
  configureKeyManager,
} from "./key-manager.js";
export type {
  KeySelection,
  PoolHealthSummary,
  AuthResult,
  ProviderKeyConfig,
  KeyManagerConfig,
} from "./key-manager.js";

// ── Model Config ──────────────────────────────────────────────────────────────

export {
  MODELS,
  FALLBACK_CHAINS,
  getModelInfo,
  getModelsByTier,
  getModelsByCapability,
  estimateCost,
} from "./model-config.js";
export type { ModelInfo, ModelTier } from "./model-config.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  // Shared message/response types
  LLMMessage,
  LLMResponse,
  LLMClient,
  TokenUsage,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  StopReason,
  CreateMessageParams,
  ToolDefinition,
  ToolInputSchema,

  // Thinking
  ThinkingConfig,
  ThinkingEnabled,
  ThinkingAdaptive,

  // Provider config
  Provider,
  ProviderConfig,

  // Key management
  KeyEntry,
  KeyConfig,

  // Circuit breaker
  CircuitState,
  FailureReason,
  CircuitBreakerConfig,

  // Client options
  ResilientClientOptions,
  ClientConfig,
} from "./types.js";

export type { AttemptRecord } from "./resilient-client.js";
