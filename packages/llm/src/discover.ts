/**
 * Auto Model Discovery
 *
 * Queries a provider's /v1/models endpoint at runtime and returns a
 * normalised list of available models.
 *
 * Supports Anthropic's native format and any OpenAI-compatible provider.
 * Falls back to standard environment variable names for API keys.
 *
 * @example
 * ```ts
 * // Discover available Anthropic models using env var
 * const models = await discoverModels("anthropic");
 *
 * // Discover with an explicit key
 * const models = await discoverModels("openrouter", { apiKey: "sk-or-..." });
 *
 * // Discover from a custom endpoint
 * const models = await discoverModels("openai-compatible", {
 *   apiKey: "my-key",
 *   baseUrl: "https://my-proxy.example.com/v1",
 * });
 * ```
 */

import type { Provider } from "./types.js";
import { KNOWN_ENDPOINTS } from "./providers/openai-compatible.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscoveredModel {
  id: string;
  label: string;
  /** Short contextual note, e.g. "128k ctx" or "2025-03-01". */
  note?: string;
}

export interface DiscoverOptions {
  /** API key. Falls back to the provider's standard env var when omitted. */
  apiKey?: string;
  /** Base URL override. Defaults to the provider's well-known endpoint. */
  baseUrl?: string;
}

// ── Env var lookup ────────────────────────────────────────────────────────────

const ENV_KEYS: Partial<Record<Provider, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  "openai-codex": "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  "opencode-zen": "OPENCODE_API_KEY",
  "opencode-go": "OPENCODE_API_KEY",
  "z-ai": "ZAI_API_KEY",
  minimax: "MINIMAX_API_KEY",
  kimi: "KIMI_API_KEY",
  "openai-compatible": "OPENAI_COMPATIBLE_API_KEY",
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Query a provider's model listing endpoint and return a normalised list.
 *
 * Throws on HTTP errors so callers can surface them to the user.
 * Returns an empty array if the provider has no models endpoint (404).
 */
export async function discoverModels(
  provider: Provider,
  options?: DiscoverOptions,
): Promise<DiscoveredModel[]> {
  const envVar = ENV_KEYS[provider];
  const apiKey = options?.apiKey ?? (envVar ? process.env[envVar] : undefined);

  if (provider === "anthropic") {
    if (!apiKey) {
      throw new Error(
        `anthropic requires an API key — set ANTHROPIC_API_KEY or pass options.apiKey`,
      );
    }
    return fetchAnthropicModels(apiKey);
  }

  const baseUrl =
    options?.baseUrl ??
    KNOWN_ENDPOINTS[provider] ??
    (provider === "openai" || provider === "openai-codex"
      ? "https://api.openai.com/v1"
      : undefined);

  if (!baseUrl) {
    throw new Error(
      `No known endpoint for provider "${provider}". ` +
        `Pass options.baseUrl or add it to KNOWN_ENDPOINTS.`,
    );
  }

  if (provider === "lmstudio") {
    // LM Studio requires no auth
    return fetchOpenAICompatModels(baseUrl, null, provider);
  }

  return fetchOpenAICompatModels(baseUrl, apiKey ?? null, provider);
}

// ── Internal fetch helpers ────────────────────────────────────────────────────

async function fetchAnthropicModels(apiKey: string): Promise<DiscoveredModel[]> {
  const res = await fetch("https://api.anthropic.com/v1/models?limit=200", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`anthropic ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    data?: { id?: string; display_name?: string; created_at?: string }[];
  };
  return (json.data ?? [])
    .filter(
      (m): m is { id: string; display_name?: string; created_at?: string } =>
        !!m.id,
    )
    .map((m) => ({
      id: m.id,
      label: m.display_name || m.id,
      note: m.created_at ? m.created_at.slice(0, 10) : undefined,
    }));
}

async function fetchOpenAICompatModels(
  baseUrl: string,
  apiKey: string | null,
  provider: string,
): Promise<DiscoveredModel[]> {
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/models`, { headers });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        `${provider} doesn't expose a /models listing endpoint — ` +
          `use the curated list or pass a model ID directly`,
      );
    }
    const body = await res.text().catch(() => "");
    throw new Error(`${provider} ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    data?: {
      id?: string;
      name?: string;
      display_name?: string;
      context_length?: number;
    }[];
  };
  return (json.data ?? [])
    .filter(
      (m): m is NonNullable<typeof json.data>[number] & { id: string } =>
        !!m?.id,
    )
    .map((m) => ({
      id: m.id,
      label: m.display_name || m.name || m.id,
      note: m.context_length
        ? `${Math.round(m.context_length / 1000)}k ctx`
        : undefined,
    }));
}
