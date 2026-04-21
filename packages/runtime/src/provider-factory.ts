/**
 * Custom provider factory.
 *
 * Builds LLM clients from `ProviderConfig` objects — the runtime
 * counterpart to the built-in provider list in `@agentic/llm`.
 *
 * Resolves API keys from KeyManager (populated during AgenticRuntime.create),
 * falling back to environment variables for providers without explicit keys.
 */

import {
  AnthropicClient,
  OpenAIClient,
  buildCompatibleClient,
  getKeyManager,
  type LLMClient,
} from "@agentic/llm";
import type { ProviderConfig } from "./types.js";

/**
 * Build an `LLMClient` from a `ProviderConfig` for a named provider.
 *
 * @param def   Provider definition from `AgenticConfig.providers`.
 * @param name  The provider name (used for KeyManager lookup and env-var fallback).
 */
export function buildCustomClient(def: ProviderConfig, name: string): LLMClient {
  const apiKey = resolveApiKey(name);

  switch (def.type) {
    case "openai-compatible": {
      if (!def.baseUrl) {
        throw new Error(
          `Custom provider "${name}" has type "openai-compatible" but no baseUrl.`,
        );
      }
      return buildCompatibleClient({
        provider: "openai-compatible",
        apiKey: apiKey ?? "not-required",
        baseURL: def.baseUrl,
        defaultHeaders: def.headers,
      });
    }

    case "anthropic": {
      return new AnthropicClient({ apiKey, baseURL: def.baseUrl });
    }

    case "openai": {
      return new OpenAIClient({ apiKey, baseURL: def.baseUrl });
    }

    default: {
      throw new Error(
        `Unknown custom provider type "${def.type}" for provider "${name}". ` +
          `Expected "openai-compatible", "anthropic", or "openai".`,
      );
    }
  }
}

function resolveApiKey(name: string): string | undefined {
  const km = getKeyManager();
  if (km.hasKeys(name)) {
    const sessionId = `factory-${name}`;
    return km.getKeySelection(name, sessionId)?.key;
  }
  return process.env[`${name.toUpperCase().replace(/-/g, "_")}_API_KEY`];
}
