/**
 * Client Factory
 *
 * `parseModelString()` — splits "provider/model-id" strings into a ProviderConfig.
 * `createClient()`    — builds a bare LLMClient for a model string.
 *
 * For production use with retries/fallbacks, prefer `createResilientClient()`
 * from `resilient-client.ts`.
 */
import { KNOWN_ENDPOINTS } from "./providers/openai-compatible.js";
import type { LLMClient, ProviderConfig, ClientConfig } from "./types.js";
/**
 * Parse a "provider/model-id" string into a structured `ProviderConfig`.
 *
 * The provider prefix is case-insensitive and must be one of the known
 * provider names. The model ID is everything after the first slash.
 *
 * @example
 * ```ts
 * parseModelString("anthropic/claude-sonnet-4-20250514")
 * // → { provider: "anthropic", modelId: "claude-sonnet-4-20250514" }
 *
 * parseModelString("openrouter/anthropic/claude-sonnet-4")
 * // → { provider: "openrouter", modelId: "anthropic/claude-sonnet-4" }
 *
 * parseModelString("lmstudio/my-local-model")
 * // → { provider: "lmstudio", modelId: "my-local-model" }
 * ```
 *
 * @throws if the string has no "/" or the provider is not recognised.
 */
export declare function parseModelString(model: string): ProviderConfig;
/**
 * Build a bare `LLMClient` for the given model string.
 *
 * Key lookup order:
 * 1. `config.keys[provider].keys[0]` (first key in config)
 * 2. Environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
 *
 * For multi-key rotation and fallback chains, use `createResilientClient()`.
 *
 * @param model - "provider/model-id" string, e.g. "anthropic/claude-sonnet-4-20250514"
 * @param config - Optional configuration (keys, base URLs).
 *
 * @example
 * ```ts
 * const client = createClient("anthropic/claude-sonnet-4-20250514");
 * const response = await client.createMessage({
 *   model: "claude-sonnet-4-20250514",
 *   system: "You are helpful.",
 *   messages: [{ role: "user", content: "Hi!" }],
 *   tools: [],
 *   maxTokens: 512,
 * });
 * ```
 */
export declare function createClient(model: string, config?: ClientConfig): LLMClient;
export { KNOWN_ENDPOINTS };
//# sourceMappingURL=client.d.ts.map