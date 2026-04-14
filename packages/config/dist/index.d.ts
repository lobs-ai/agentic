/**
 * @agentic/config — Configuration system for AI agents.
 *
 * Provides:
 *   - Model tier resolution (micro / small / medium / standard / strong)
 *   - API key management with multi-key pools
 *   - Agent identity configuration
 *   - Config directory resolution and file loading
 *   - Config validation with helpful error messages
 */
export type { ModelTier, ModelsConfig, TierMap, AgentModelConfig, ModelDefinition, ModelCost, ModelContext, KeyEntry, KeyPool, KeyConfig, IdentityConfig, BotIdentity, OwnerIdentity, RuntimeConfig, LoadConfigOptions, ValidationResult, AllConfigsResult, } from "./types.js";
export { DEFAULT_TIER_MAP, KNOWN_MODELS, loadModelsConfig, mergeModelsConfig, resetModelsCache, getModelForTier, getModelForAgent, getFallbackChain, getModelDefinition, estimateCost, getModelsForTier, } from "./models.js";
export { getEnvKeyForProvider, normalizeKeyConfig, loadKeyConfig, getFirstKey, hasKeyForProvider, buildKeyConfig, } from "./keys.js";
export { DEFAULT_IDENTITY, loadIdentityConfig, buildIdentityConfig, resetIdentityCache, getBotName, getBotId, getOwnerName, getOwnerId, getOwnerDiscordId, getIdentity, getBotMentionNames, } from "./identity.js";
export { getConfigDir, getSecretsDir, loadRuntimeConfig, getServerPort, getGatewayConfig, loadConfigFile, } from "./loader.js";
export { validateAllConfigs, validateModelsObject, printValidationResults, } from "./validator.js";
//# sourceMappingURL=index.d.ts.map