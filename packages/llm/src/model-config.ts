/**
 * Model Configuration
 *
 * Defines model tiers, cost data, and curated fallback chains.
 * This is advisory metadata — callers use it to pick models and estimate costs.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Model cost tier. */
export type ModelTier = "free" | "cheap" | "standard" | "premium";

/**
 * Metadata about a single model.
 */
export interface ModelInfo {
  /** Provider-prefixed model string, e.g. "anthropic/claude-sonnet-4-20250514" */
  model: string;
  /** Human-readable display name */
  displayName: string;
  /** Cost tier */
  tier: ModelTier;
  /** Cost per 1M input tokens in USD */
  costPer1MInput: number;
  /** Cost per 1M output tokens in USD */
  costPer1MOutput: number;
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Quality score 0–100 (subjective, curated) */
  quality: number;
  /** Capability tags */
  capabilities: string[];
}

// ── Model Registry ────────────────────────────────────────────────────────────

/**
 * Curated registry of well-known models.
 * Useful for cost estimation, tier selection, and capability checks.
 */
export const MODELS: ModelInfo[] = [
  // ── Anthropic ──────────────────────────────────────────────────────────────
  {
    model: "anthropic/claude-sonnet-4-20250514",
    displayName: "Claude Sonnet 4",
    tier: "standard",
    costPer1MInput: 3.00,
    costPer1MOutput: 15.00,
    contextWindow: 200_000,
    quality: 92,
    capabilities: ["chat", "code", "reasoning", "tool-use"],
  },
  {
    model: "anthropic/claude-haiku-4-20250514",
    displayName: "Claude Haiku 4",
    tier: "cheap",
    costPer1MInput: 0.80,
    costPer1MOutput: 4.00,
    contextWindow: 200_000,
    quality: 78,
    capabilities: ["chat", "code", "tool-use"],
  },
  {
    model: "anthropic/claude-opus-4-20250514",
    displayName: "Claude Opus 4",
    tier: "premium",
    costPer1MInput: 15.00,
    costPer1MOutput: 75.00,
    contextWindow: 200_000,
    quality: 97,
    capabilities: ["chat", "code", "reasoning", "tool-use"],
  },

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  {
    model: "openai/gpt-4.1",
    displayName: "GPT-4.1",
    tier: "standard",
    costPer1MInput: 2.00,
    costPer1MOutput: 8.00,
    contextWindow: 1_047_576,
    quality: 90,
    capabilities: ["chat", "code", "reasoning", "tool-use"],
  },
  {
    model: "openai/gpt-4.1-mini",
    displayName: "GPT-4.1 Mini",
    tier: "cheap",
    costPer1MInput: 0.40,
    costPer1MOutput: 1.60,
    contextWindow: 1_047_576,
    quality: 80,
    capabilities: ["chat", "code", "tool-use"],
  },
  {
    model: "openai/gpt-4.1-nano",
    displayName: "GPT-4.1 Nano",
    tier: "cheap",
    costPer1MInput: 0.10,
    costPer1MOutput: 0.40,
    contextWindow: 1_047_576,
    quality: 70,
    capabilities: ["chat", "code"],
  },
  {
    model: "openai/gpt-4o",
    displayName: "GPT-4o",
    tier: "standard",
    costPer1MInput: 2.50,
    costPer1MOutput: 10.00,
    contextWindow: 128_000,
    quality: 89,
    capabilities: ["chat", "code", "reasoning", "tool-use"],
  },

  // ── OpenRouter ─────────────────────────────────────────────────────────────
  {
    model: "openrouter/anthropic/claude-sonnet-4",
    displayName: "Claude Sonnet 4 (via OpenRouter)",
    tier: "standard",
    costPer1MInput: 3.00,
    costPer1MOutput: 15.00,
    contextWindow: 200_000,
    quality: 92,
    capabilities: ["chat", "code", "reasoning", "tool-use"],
  },
  {
    model: "openrouter/google/gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro (via OpenRouter)",
    tier: "standard",
    costPer1MInput: 1.25,
    costPer1MOutput: 10.00,
    contextWindow: 1_000_000,
    quality: 91,
    capabilities: ["chat", "code", "reasoning", "tool-use"],
  },

  // ── Kimi ───────────────────────────────────────────────────────────────────
  {
    model: "kimi/kimi-k2.5",
    displayName: "Kimi K2.5",
    tier: "standard",
    costPer1MInput: 0.42,
    costPer1MOutput: 2.20,
    contextWindow: 131_072,
    quality: 85,
    capabilities: ["chat", "code", "reasoning", "tool-use"],
  },

  // ── MiniMax (direct) ──────────────────────────────────────────────────────
  {
    model: "minimax/minimax-m2.7",
    displayName: "MiniMax M2.7",
    tier: "cheap",
    costPer1MInput: 0.20,
    costPer1MOutput: 1.00,
    contextWindow: 1_048_576,
    quality: 84,
    capabilities: ["chat", "code", "reasoning", "tool-use"],
  },
  {
    model: "minimax/minimax-m2.5",
    displayName: "MiniMax M2.5",
    tier: "free",
    costPer1MInput: 0.00,
    costPer1MOutput: 0.00,
    contextWindow: 1_048_576,
    quality: 80,
    capabilities: ["chat", "code", "tool-use"],
  },

  // ── OpenCode Zen (subscription — proprietary models via Anthropic/OpenAI APIs) ─
  {
    model: "opencode-zen/claude-sonnet-4",
    displayName: "Claude Sonnet 4 (OpenCode Zen)",
    tier: "standard",
    costPer1MInput: 3.00,
    costPer1MOutput: 15.00,
    contextWindow: 200_000,
    quality: 92,
    capabilities: ["chat", "code", "reasoning", "tool-use"],
  },
  {
    model: "opencode-zen/gpt-5.1-codex",
    displayName: "GPT-5.1 Codex (OpenCode Zen)",
    tier: "standard",
    costPer1MInput: 2.00,
    costPer1MOutput: 8.00,
    contextWindow: 1_047_576,
    quality: 90,
    capabilities: ["chat", "code", "reasoning", "tool-use"],
  },

  // ── OpenCode Go (subscription — curated open models) ────────────────────────
  {
    model: "opencode-go/kimi-k2.5",
    displayName: "Kimi K2.5 (OpenCode Go)",
    tier: "cheap",
    costPer1MInput: 0.42,
    costPer1MOutput: 2.20,
    contextWindow: 131_072,
    quality: 85,
    capabilities: ["chat", "code", "reasoning", "tool-use"],
  },
  {
    model: "opencode-go/minimax-m2.7",
    displayName: "MiniMax M2.7 (OpenCode Go)",
    tier: "cheap",
    costPer1MInput: 0.20,
    costPer1MOutput: 1.00,
    contextWindow: 1_048_576,
    quality: 84,
    capabilities: ["chat", "code", "reasoning", "tool-use"],
  },
  {
    model: "opencode-go/minimax-m2.5",
    displayName: "MiniMax M2.5 (OpenCode Go)",
    tier: "free",
    costPer1MInput: 0.00,
    costPer1MOutput: 0.00,
    contextWindow: 1_048_576,
    quality: 80,
    capabilities: ["chat", "code", "tool-use"],
  },
  {
    model: "opencode-go/glm-5.1",
    displayName: "GLM-5.1 (OpenCode Go)",
    tier: "cheap",
    costPer1MInput: 0.50,
    costPer1MOutput: 0.50,
    contextWindow: 128_000,
    quality: 83,
    capabilities: ["chat", "code", "reasoning", "tool-use"],
  },
  {
    model: "opencode-go/mimo-v2-pro",
    displayName: "MiMo V2 Pro (OpenCode Go)",
    tier: "cheap",
    costPer1MInput: 0.40,
    costPer1MOutput: 1.60,
    contextWindow: 128_000,
    quality: 82,
    capabilities: ["chat", "code", "reasoning", "tool-use"],
  },
];

// ── Fallback Chains ────────────────────────────────────────────────────────────

/**
 * Recommended fallback chains by use case.
 * Pass these as `fallbackModels` to `createResilientClient()`.
 *
 * Primary model is index [0], fallbacks are [1..].
 *
 * @example
 * ```ts
 * const [primary, ...fallbacks] = FALLBACK_CHAINS.agent;
 * const client = await createResilientClient(primary, { fallbackModels: fallbacks });
 * ```
 */
export const FALLBACK_CHAINS: Record<string, string[]> = {
  /** High-quality agent work — reasoning and tool use required. */
  agent: [
    "anthropic/claude-sonnet-4-20250514",
    "opencode-zen/claude-sonnet-4",
    "openai/gpt-4.1",
    "kimi/kimi-k2.5",
  ],

  /** Background tasks — cheap, good enough. */
  background: [
    "opencode-go/minimax-m2.7",
    "minimax/minimax-m2.7",
    "kimi/kimi-k2.5",
    "openai/gpt-4.1-mini",
  ],

  /** Summarization / classification — prefer free/cheap. */
  cheap: [
    "opencode-go/minimax-m2.5",
    "minimax/minimax-m2.5",
    "openai/gpt-4.1-nano",
    "anthropic/claude-haiku-4-20250514",
  ],

  /** Maximum quality — cost is not a concern. */
  premium: [
    "anthropic/claude-opus-4-20250514",
    "opencode-zen/gpt-5.1-codex",
    "openai/gpt-4.1",
    "anthropic/claude-sonnet-4-20250514",
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Look up metadata for a model string.
 * The model string can be "provider/model-id" format.
 * Returns `undefined` if the model is not in the registry.
 */
export function getModelInfo(model: string): ModelInfo | undefined {
  return MODELS.find((m) => m.model === model);
}

/**
 * Get all models for a given tier.
 */
export function getModelsByTier(tier: ModelTier): ModelInfo[] {
  return MODELS.filter((m) => m.tier === tier);
}

/**
 * Get all models that have a specific capability.
 * @example getModelsByCapability("tool-use")
 */
export function getModelsByCapability(capability: string): ModelInfo[] {
  return MODELS.filter((m) => m.capabilities.includes(capability));
}

/**
 * Estimate cost in USD for a call given token counts.
 * Returns `null` if the model is not in the registry.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const info = getModelInfo(model);
  if (!info) return null;

  const inputCost = (inputTokens / 1_000_000) * info.costPer1MInput;
  const outputCost = (outputTokens / 1_000_000) * info.costPer1MOutput;
  return inputCost + outputCost;
}
