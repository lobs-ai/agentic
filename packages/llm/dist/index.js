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
export { createClient, parseModelString, KNOWN_ENDPOINTS } from "./client.js";
export { createResilientClient, ResilientLLMClient, } from "./resilient-client.js";
// ── Providers ─────────────────────────────────────────────────────────────────
export { AnthropicClient } from "./providers/anthropic.js";
export { OpenAIClient } from "./providers/openai.js";
export { OpenAICompatibleClient, buildCompatibleClient, stripOpenRouterPrefix, } from "./providers/openai-compatible.js";
// ── Resilience ────────────────────────────────────────────────────────────────
export { CircuitBreaker, getCircuitBreaker, setCircuitBreaker, } from "./circuit-breaker.js";
export { KeyManager, getKeyManager, configureKeyManager, } from "./key-manager.js";
// ── Model Config ──────────────────────────────────────────────────────────────
export { MODELS, FALLBACK_CHAINS, getModelInfo, getModelsByTier, getModelsByCapability, estimateCost, } from "./model-config.js";
//# sourceMappingURL=index.js.map