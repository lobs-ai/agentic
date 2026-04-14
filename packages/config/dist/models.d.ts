/**
 * Model tier configuration — loads from models.json, env vars, or direct objects.
 *
 * Supports five tiers: micro / small / medium / standard / strong
 * with fallback chains and per-model cost/context metadata.
 */
import type { ModelTier, ModelsConfig, TierMap, AgentModelConfig, ModelDefinition } from "./types.js";
export type { ModelTier, ModelsConfig, TierMap, AgentModelConfig, ModelDefinition };
/**
 * Default tier → model mapping using current Anthropic model IDs.
 * Override by providing a models.json config file.
 */
export declare const DEFAULT_TIER_MAP: TierMap;
/**
 * Well-known model definitions with cost and context data.
 * Costs are USD per million tokens as of 2024.
 */
export declare const KNOWN_MODELS: Record<string, ModelDefinition>;
/**
 * Load models config from the config directory.
 * Cached after first load. Call resetModelsCache() to reload.
 */
export declare function loadModelsConfig(configDir?: string): ModelsConfig;
/**
 * Merge a partial config with defaults, filling in any missing tiers.
 */
export declare function mergeModelsConfig(partial: Partial<ModelsConfig>): ModelsConfig;
/** Reset the models config cache (useful for testing or config reload). */
export declare function resetModelsCache(): void;
/**
 * Get the model ID for a given tier.
 * Falls back to DEFAULT_TIER_MAP if config hasn't loaded.
 */
export declare function getModelForTier(tier: ModelTier, config?: ModelsConfig): string;
/**
 * Get the primary model for a specific agent type.
 * Falls back to the tier-based model if no agent override exists.
 */
export declare function getModelForAgent(agentType: string, fallbackTier?: ModelTier, config?: ModelsConfig): string;
/**
 * Get the full fallback chain for an agent type.
 * Returns [primary, ...fallbacks].
 */
export declare function getFallbackChain(agentType: string, fallbackTier?: ModelTier, config?: ModelsConfig): string[];
/**
 * Get full model definition metadata (cost, context, provider).
 * Returns undefined if the model isn't in the known models registry.
 */
export declare function getModelDefinition(modelId: string, config?: ModelsConfig): ModelDefinition | undefined;
/**
 * Estimate the cost of a completion.
 * Returns undefined if cost data isn't available for the model.
 */
export declare function estimateCost(modelId: string, inputTokens: number, outputTokens: number, opts?: {
    cacheWriteTokens?: number;
    cacheReadTokens?: number;
}, config?: ModelsConfig): number | undefined;
/**
 * List all model IDs that belong to a given tier.
 */
export declare function getModelsForTier(tier: ModelTier, config?: ModelsConfig): string[];
//# sourceMappingURL=models.d.ts.map