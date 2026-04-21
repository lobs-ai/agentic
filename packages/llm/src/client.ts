/**
 * Client Factory
 *
 * `inferProvider()`   — infers a provider from a bare model ID (e.g. "claude-sonnet-4-6").
 * `parseModelString()` — splits "provider/model-id" strings into a ProviderConfig,
 *                        or auto-infers the provider when no prefix is given.
 * `createClient()`    — builds a bare LLMClient for a model string.
 *
 * For production use with retries/fallbacks, prefer `createResilientClient()`
 * from `resilient-client.ts`.
 */

import { AnthropicClient } from "./providers/anthropic.js";
import { OpenAIClient } from "./providers/openai.js";
import {
  buildCompatibleClient,
  stripOpenRouterPrefix,
  KNOWN_ENDPOINTS,
} from "./providers/openai-compatible.js";
import type {
  LLMClient,
  ProviderConfig,
  Provider,
  ClientConfig,
} from "./types.js";

// ── inferProvider ─────────────────────────────────────────────────────────────

/**
 * Well-known model-name prefixes and their canonical providers.
 * Checked in order; first match wins. Case-insensitive.
 */
const MODEL_PROVIDER_PREFIXES: Array<[string, Provider]> = [
  ["claude", "anthropic"],
  ["codex-", "openai-codex"],
  ["gpt-", "openai"],
  ["o1-", "openai"],
  ["o1", "openai"],
  ["o3-", "openai"],
  ["o3", "openai"],
  ["o4-", "openai"],
  ["o4", "openai"],
  ["text-davinci", "openai"],
];

/**
 * Infer a provider from a bare model ID such as `"claude-sonnet-4-6"` or
 * `"gpt-4o"`. Returns `null` when no prefix matches.
 *
 * Use `parseModelString` if you want automatic fallback with an error on
 * unknown model IDs.
 */
export function inferProvider(model: string): Provider | null {
  const lower = model.toLowerCase();
  for (const [prefix, provider] of MODEL_PROVIDER_PREFIXES) {
    if (lower.startsWith(prefix)) return provider;
  }
  return null;
}

// ── parseModelString ──────────────────────────────────────────────────────────

const KNOWN_PROVIDERS: Provider[] = [
  "anthropic",
  "openai",
  "openai-codex",
  "lmstudio",
  "openrouter",
  "openai-compatible",
  "opencode-zen",
  "opencode-go",
  "z-ai",
  "minimax",
  "kimi",
];

/**
 * Parse a model string into a structured `ProviderConfig`.
 *
 * Accepts two formats:
 * - `"provider/model-id"` — explicit provider prefix (e.g. `"anthropic/claude-sonnet-4-6"`)
 * - `"model-id"` — bare model ID; provider is inferred from the name prefix
 *   (e.g. `"claude-sonnet-4-6"` → `anthropic`, `"gpt-4o"` → `openai`)
 *
 * @example
 * ```ts
 * parseModelString("claude-sonnet-4-6")
 * // → { provider: "anthropic", modelId: "claude-sonnet-4-6" }
 *
 * parseModelString("anthropic/claude-sonnet-4-20250514")
 * // → { provider: "anthropic", modelId: "claude-sonnet-4-20250514" }
 *
 * parseModelString("openrouter/anthropic/claude-sonnet-4")
 * // → { provider: "openrouter", modelId: "anthropic/claude-sonnet-4" }
 * ```
 *
 * @throws if the provider cannot be inferred or is not recognised.
 */
export function parseModelString(model: string): ProviderConfig {
  const slashIdx = model.indexOf("/");

  if (slashIdx === -1) {
    // No slash — try to infer provider from the model name
    const inferred = inferProvider(model);
    if (inferred) {
      return { provider: inferred, modelId: model };
    }
    throw new Error(
      `Cannot infer provider for model "${model}". ` +
        `Use "provider/model-id" format or a well-known model name ` +
        `(e.g. "claude-sonnet-4-6", "gpt-4o"). ` +
        `Known providers: ${KNOWN_PROVIDERS.join(", ")}`,
    );
  }

  const providerRaw = model.slice(0, slashIdx).toLowerCase();
  const modelId = model.slice(slashIdx + 1);

  if (!KNOWN_PROVIDERS.includes(providerRaw as Provider)) {
    throw new Error(
      `Unknown provider "${providerRaw}" in model string "${model}". ` +
        `Known providers: ${KNOWN_PROVIDERS.join(", ")}`,
    );
  }

  return { provider: providerRaw as Provider, modelId };
}

// ── createClient ──────────────────────────────────────────────────────────────

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
export function createClient(model: string, config?: ClientConfig): LLMClient {
  const { provider, modelId } = parseModelString(model);

  // Helper: get first key for a provider from config
  const getKey = (providerName: string): string | undefined =>
    config?.keys?.[providerName]?.keys?.[0]?.key;

  // Helper: get base URL for a provider
  const getBaseUrl = (providerName: string): string | undefined =>
    config?.baseUrls?.[providerName as Provider];

  switch (provider) {
    case "anthropic": {
      const apiKey = getKey("anthropic") ?? process.env.ANTHROPIC_API_KEY;
      return new AnthropicClient({
        apiKey,
        baseURL: getBaseUrl("anthropic"),
      });
    }

    case "openai":
    case "openai-codex": {
      const apiKey = getKey("openai") ?? process.env.OPENAI_API_KEY;
      return new OpenAIClient({
        apiKey,
        baseURL: getBaseUrl("openai"),
      });
    }

    case "openrouter": {
      const apiKey =
        getKey("openrouter") ?? process.env.OPENROUTER_API_KEY;
      return buildCompatibleClient({
        provider: "openrouter",
        apiKey,
        baseURL: getBaseUrl("openrouter"),
        defaultHeaders: { "X-Title": "agentic/llm" },
      });
    }

    case "lmstudio": {
      return buildCompatibleClient({
        provider: "lmstudio",
        apiKey: "not-required",
        baseURL: getBaseUrl("lmstudio"),
      });
    }

    case "opencode-zen": {
      const apiKey = getKey("opencode-zen") ?? process.env.OPENCODE_API_KEY;
      return buildCompatibleClient({
        provider: "opencode-zen",
        apiKey,
        baseURL: getBaseUrl("opencode-zen"),
      });
    }

    case "opencode-go": {
      const apiKey = getKey("opencode-go") ?? process.env.OPENCODE_API_KEY;
      return buildCompatibleClient({
        provider: "opencode-go",
        apiKey,
        baseURL: getBaseUrl("opencode-go"),
      });
    }

    case "z-ai": {
      const apiKey = getKey("z-ai") ?? process.env.ZAI_API_KEY;
      return buildCompatibleClient({
        provider: "z-ai",
        apiKey,
        baseURL: getBaseUrl("z-ai"),
      });
    }

    case "minimax": {
      const apiKey = getKey("minimax") ?? process.env.MINIMAX_API_KEY;
      return buildCompatibleClient({
        provider: "minimax",
        apiKey,
        baseURL: getBaseUrl("minimax"),
      });
    }

    case "kimi": {
      const apiKey = getKey("kimi") ?? process.env.KIMI_API_KEY;
      return buildCompatibleClient({
        provider: "kimi",
        apiKey,
        baseURL: getBaseUrl("kimi"),
      });
    }

    case "openai-compatible": {
      const apiKey = getKey("openai-compatible") ?? process.env.OPENAI_COMPATIBLE_API_KEY;
      const baseURL =
        getBaseUrl("openai-compatible") ??
        process.env.OPENAI_COMPATIBLE_BASE_URL;
      if (!baseURL) {
        throw new Error(
          `Provider "openai-compatible" requires a baseURL. ` +
            `Set config.baseUrls["openai-compatible"] or OPENAI_COMPATIBLE_BASE_URL.`,
        );
      }
      return buildCompatibleClient({
        provider: "openai-compatible",
        apiKey,
        baseURL,
      });
    }

    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unhandled provider: ${_exhaustive}`);
    }
  }
}

// ── Re-export for convenience ─────────────────────────────────────────────────

export { KNOWN_ENDPOINTS };
