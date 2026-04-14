/**
 * Model Configuration
 *
 * Defines model tiers, cost data, and curated fallback chains.
 * This is advisory metadata — callers use it to pick models and estimate costs.
 */
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
/**
 * Curated registry of well-known models.
 * Useful for cost estimation, tier selection, and capability checks.
 */
export declare const MODELS: ModelInfo[];
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
export declare const FALLBACK_CHAINS: Record<string, string[]>;
/**
 * Look up metadata for a model string.
 * The model string can be "provider/model-id" format.
 * Returns `undefined` if the model is not in the registry.
 */
export declare function getModelInfo(model: string): ModelInfo | undefined;
/**
 * Get all models for a given tier.
 */
export declare function getModelsByTier(tier: ModelTier): ModelInfo[];
/**
 * Get all models that have a specific capability.
 * @example getModelsByCapability("tool-use")
 */
export declare function getModelsByCapability(capability: string): ModelInfo[];
/**
 * Estimate cost in USD for a call given token counts.
 * Returns `null` if the model is not in the registry.
 */
export declare function estimateCost(model: string, inputTokens: number, outputTokens: number): number | null;
//# sourceMappingURL=model-config.d.ts.map