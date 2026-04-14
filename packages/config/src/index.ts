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

// Types
export type {
  // Model types
  ModelTier,
  ModelsConfig,
  TierMap,
  AgentModelConfig,
  ModelDefinition,
  ModelCost,
  ModelContext,
  // Key types
  KeyEntry,
  KeyPool,
  KeyConfig,
  // Identity types
  IdentityConfig,
  BotIdentity,
  OwnerIdentity,
  // Runtime types
  RuntimeConfig,
  // Loader types
  LoadConfigOptions,
  // Validation types
  ValidationResult,
  AllConfigsResult,
} from "./types.js";

// Models
export {
  DEFAULT_TIER_MAP,
  KNOWN_MODELS,
  loadModelsConfig,
  mergeModelsConfig,
  resetModelsCache,
  getModelForTier,
  getModelForAgent,
  getFallbackChain,
  getModelDefinition,
  estimateCost,
  getModelsForTier,
} from "./models.js";

// Keys
export {
  getEnvKeyForProvider,
  normalizeKeyConfig,
  loadKeyConfig,
  getFirstKey,
  hasKeyForProvider,
  buildKeyConfig,
} from "./keys.js";

// Identity
export {
  DEFAULT_IDENTITY,
  loadIdentityConfig,
  buildIdentityConfig,
  resetIdentityCache,
  getBotName,
  getBotId,
  getOwnerName,
  getOwnerId,
  getOwnerDiscordId,
  getIdentity,
  getBotMentionNames,
} from "./identity.js";

// Loader
export {
  getConfigDir,
  getSecretsDir,
  loadRuntimeConfig,
  getServerPort,
  getGatewayConfig,
  loadConfigFile,
} from "./loader.js";

// Validator
export {
  validateAllConfigs,
  validateModelsObject,
  printValidationResults,
} from "./validator.js";
