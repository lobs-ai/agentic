/**
 * Model tier configuration — loads from models.json, env vars, or direct objects.
 *
 * Supports five tiers: micro / small / medium / standard / strong
 * with fallback chains and per-model cost/context metadata.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getConfigDir } from "./loader.js";
// ── Built-in defaults ─────────────────────────────────────────────────────────
/**
 * Default tier → model mapping using current Anthropic model IDs.
 * Override by providing a models.json config file.
 */
export const DEFAULT_TIER_MAP = {
    micro: "claude-haiku-4-5",
    small: "claude-haiku-4-5",
    medium: "claude-sonnet-4-5",
    standard: "claude-sonnet-4-5",
    strong: "claude-opus-4-5",
};
/**
 * Well-known model definitions with cost and context data.
 * Costs are USD per million tokens as of 2024.
 */
export const KNOWN_MODELS = {
    // Anthropic — Claude 3.5
    "claude-3-5-haiku-20241022": {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        provider: "anthropic",
        tier: "micro",
        cost: { inputPerMillion: 0.80, outputPerMillion: 4.00, cacheWritePerMillion: 1.00, cacheReadPerMillion: 0.08 },
        context: { maxInputTokens: 200_000, maxOutputTokens: 8_192 },
    },
    "claude-3-5-sonnet-20241022": {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        provider: "anthropic",
        tier: "standard",
        cost: { inputPerMillion: 3.00, outputPerMillion: 15.00, cacheWritePerMillion: 3.75, cacheReadPerMillion: 0.30 },
        context: { maxInputTokens: 200_000, maxOutputTokens: 8_192 },
    },
    // Anthropic — Claude 3
    "claude-3-haiku-20240307": {
        id: "claude-3-haiku-20240307",
        name: "Claude 3 Haiku",
        provider: "anthropic",
        tier: "micro",
        cost: { inputPerMillion: 0.25, outputPerMillion: 1.25, cacheWritePerMillion: 0.30, cacheReadPerMillion: 0.03 },
        context: { maxInputTokens: 200_000, maxOutputTokens: 4_096 },
    },
    "claude-3-sonnet-20240229": {
        id: "claude-3-sonnet-20240229",
        name: "Claude 3 Sonnet",
        provider: "anthropic",
        tier: "medium",
        cost: { inputPerMillion: 3.00, outputPerMillion: 15.00 },
        context: { maxInputTokens: 200_000, maxOutputTokens: 4_096 },
    },
    "claude-3-opus-20240229": {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        provider: "anthropic",
        tier: "strong",
        cost: { inputPerMillion: 15.00, outputPerMillion: 75.00, cacheWritePerMillion: 18.75, cacheReadPerMillion: 1.50 },
        context: { maxInputTokens: 200_000, maxOutputTokens: 4_096 },
    },
    // OpenAI
    "gpt-4o": {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        tier: "strong",
        cost: { inputPerMillion: 5.00, outputPerMillion: 15.00 },
        context: { maxInputTokens: 128_000, maxOutputTokens: 4_096 },
    },
    "gpt-4o-mini": {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        provider: "openai",
        tier: "small",
        cost: { inputPerMillion: 0.15, outputPerMillion: 0.60 },
        context: { maxInputTokens: 128_000, maxOutputTokens: 16_384 },
    },
    "gpt-3.5-turbo": {
        id: "gpt-3.5-turbo",
        name: "GPT-3.5 Turbo",
        provider: "openai",
        tier: "micro",
        cost: { inputPerMillion: 0.50, outputPerMillion: 1.50 },
        context: { maxInputTokens: 16_385, maxOutputTokens: 4_096 },
    },
};
// ── Config loading ────────────────────────────────────────────────────────────
let _cached = null;
/**
 * Load models config from the config directory.
 * Cached after first load. Call resetModelsCache() to reload.
 */
export function loadModelsConfig(configDir) {
    if (_cached)
        return _cached;
    const dir = configDir ?? getConfigDir();
    const path = resolve(dir, "models.json");
    if (!existsSync(path)) {
        _cached = { tiers: { ...DEFAULT_TIER_MAP } };
        return _cached;
    }
    try {
        const raw = JSON.parse(readFileSync(path, "utf-8"));
        _cached = mergeModelsConfig(raw);
        return _cached;
    }
    catch (err) {
        console.warn(`[config/models] Failed to load ${path}:`, err);
        _cached = { tiers: { ...DEFAULT_TIER_MAP } };
        return _cached;
    }
}
/**
 * Merge a partial config with defaults, filling in any missing tiers.
 */
export function mergeModelsConfig(partial) {
    const tiers = {
        ...DEFAULT_TIER_MAP,
        ...partial.tiers,
    };
    return {
        tiers,
        agents: partial.agents,
        models: { ...KNOWN_MODELS, ...partial.models },
        local: partial.local,
    };
}
/** Reset the models config cache (useful for testing or config reload). */
export function resetModelsCache() {
    _cached = null;
}
// ── Tier resolution ───────────────────────────────────────────────────────────
/**
 * Get the model ID for a given tier.
 * Falls back to DEFAULT_TIER_MAP if config hasn't loaded.
 */
export function getModelForTier(tier, config) {
    const cfg = config ?? loadModelsConfig();
    return cfg.tiers[tier] ?? DEFAULT_TIER_MAP[tier];
}
/**
 * Get the primary model for a specific agent type.
 * Falls back to the tier-based model if no agent override exists.
 */
export function getModelForAgent(agentType, fallbackTier = "medium", config) {
    const cfg = config ?? loadModelsConfig();
    return cfg.agents?.[agentType]?.primary ?? getModelForTier(fallbackTier, cfg);
}
/**
 * Get the full fallback chain for an agent type.
 * Returns [primary, ...fallbacks].
 */
export function getFallbackChain(agentType, fallbackTier = "medium", config) {
    const cfg = config ?? loadModelsConfig();
    const agentCfg = cfg.agents?.[agentType];
    if (agentCfg) {
        const chain = [agentCfg.primary];
        if (agentCfg.fallbacks)
            chain.push(...agentCfg.fallbacks);
        return chain;
    }
    // Fall back to tier → next tier chain
    const tierOrder = ["micro", "small", "medium", "standard", "strong"];
    const tierIdx = tierOrder.indexOf(fallbackTier);
    const primary = getModelForTier(fallbackTier, cfg);
    const fallbacks = tierOrder
        .slice(tierIdx + 1)
        .map((t) => getModelForTier(t, cfg))
        .filter((m) => m !== primary);
    return [primary, ...fallbacks];
}
// ── Model metadata ────────────────────────────────────────────────────────────
/**
 * Get full model definition metadata (cost, context, provider).
 * Returns undefined if the model isn't in the known models registry.
 */
export function getModelDefinition(modelId, config) {
    const cfg = config ?? loadModelsConfig();
    return cfg.models?.[modelId] ?? KNOWN_MODELS[modelId];
}
/**
 * Estimate the cost of a completion.
 * Returns undefined if cost data isn't available for the model.
 */
export function estimateCost(modelId, inputTokens, outputTokens, opts, config) {
    const def = getModelDefinition(modelId, config);
    if (!def?.cost)
        return undefined;
    const { inputPerMillion, outputPerMillion, cacheWritePerMillion = 0, cacheReadPerMillion = 0 } = def.cost;
    let cost = (inputTokens / 1_000_000) * inputPerMillion
        + (outputTokens / 1_000_000) * outputPerMillion;
    if (opts?.cacheWriteTokens) {
        cost += (opts.cacheWriteTokens / 1_000_000) * cacheWritePerMillion;
    }
    if (opts?.cacheReadTokens) {
        cost += (opts.cacheReadTokens / 1_000_000) * cacheReadPerMillion;
    }
    return cost;
}
/**
 * List all model IDs that belong to a given tier.
 */
export function getModelsForTier(tier, config) {
    const cfg = config ?? loadModelsConfig();
    const allModels = { ...KNOWN_MODELS, ...cfg.models };
    return Object.values(allModels)
        .filter((m) => m.tier === tier)
        .map((m) => m.id);
}
//# sourceMappingURL=models.js.map