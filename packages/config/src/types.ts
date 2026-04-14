/**
 * All configuration types for @agentic/config.
 */

// ── Model Tiers ───────────────────────────────────────────────────────────────

/** Canonical model tier names. */
export type ModelTier = "micro" | "small" | "medium" | "standard" | "strong";

/** Per-model cost definition (USD per million tokens). */
export interface ModelCost {
  /** Cost per million input tokens in USD. */
  inputPerMillion: number;
  /** Cost per million output tokens in USD. */
  outputPerMillion: number;
  /** Cost per million cache-write tokens in USD (optional). */
  cacheWritePerMillion?: number;
  /** Cost per million cache-read tokens in USD (optional). */
  cacheReadPerMillion?: number;
}

/** Context window limits for a model. */
export interface ModelContext {
  /** Maximum input tokens. */
  maxInputTokens: number;
  /** Maximum output tokens. */
  maxOutputTokens: number;
}

/** Full definition for a single model. */
export interface ModelDefinition {
  /** Model ID as used by the provider API. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Provider (e.g. "anthropic", "openai", "openrouter"). */
  provider: string;
  /** Which tier this model belongs to. */
  tier: ModelTier;
  /** Cost information (USD per million tokens). */
  cost?: ModelCost;
  /** Context window limits. */
  context?: ModelContext;
}

/** Tier-to-model-ID mapping (the "tiers" section of models.json). */
export type TierMap = Record<ModelTier, string>;

/** Per-agent model config: primary model + fallback chain. */
export interface AgentModelConfig {
  /** Primary model ID to use for this agent type. */
  primary: string;
  /** Ordered fallback chain if primary is unavailable. */
  fallbacks?: string[];
}

/** Local/self-hosted model config. */
export interface LocalModelConfig {
  /** Base URL for the local OpenAI-compatible endpoint. */
  baseUrl: string;
  /** Model name to use for chat completions. */
  chatModel: string;
}

/** Full models configuration (models.json). */
export interface ModelsConfig {
  /** Tier → model ID mapping. */
  tiers: TierMap;
  /** Per-agent overrides. Keys are agent type strings. */
  agents?: Record<string, AgentModelConfig>;
  /** Known model definitions with cost/context metadata. */
  models?: Record<string, ModelDefinition>;
  /** Local/self-hosted model config. */
  local?: LocalModelConfig;
}

// ── API Keys ─────────────────────────────────────────────────────────────────

/** A single API key entry. */
export interface KeyEntry {
  /** The API key value. */
  key: string;
  /** Human-readable label (e.g. "key-1", "personal", "work"). */
  label?: string;
}

/** A pool of API keys for a single provider, with load strategy. */
export interface KeyPool {
  keys: KeyEntry[];
  strategy: "sticky-failover";
}

/** Provider name → key pool mapping. */
export type KeyConfig = Record<string, KeyPool>;

// ── Identity ─────────────────────────────────────────────────────────────────

/** Bot agent identity. */
export interface BotIdentity {
  /** Display name (e.g. "Lobs", "MyBot"). */
  name: string;
  /** Lowercase identifier (e.g. "lobs", "mybot"). */
  id: string;
}

/** Owner/operator identity. */
export interface OwnerIdentity {
  /** Display name (e.g. "Rafe", "Marcus"). */
  name: string;
  /** Lowercase identifier. */
  id: string;
  /** Discord user ID (optional). */
  discordId?: string;
}

/** Full identity configuration (identity.json). */
export interface IdentityConfig {
  bot: BotIdentity;
  owner: OwnerIdentity;
}

// ── Runtime Config ────────────────────────────────────────────────────────────

/** Server/gateway runtime config (agent.json or lobs.json). */
export interface RuntimeConfig {
  server?: {
    port?: number;
  };
  gateway?: {
    port?: number;
    auth?: {
      token?: string;
    };
  };
  circuitBreaker?: {
    failureThreshold?: number;
    cooldownMinutes?: number;
    windowMinutes?: number;
    enabled?: boolean;
  };
}

// ── Loader ────────────────────────────────────────────────────────────────────

/** Options for loading config from the filesystem. */
export interface LoadConfigOptions {
  /**
   * Base config directory. Defaults to:
   *   1. `AGENT_CONFIG_DIR` env var
   *   2. `~/.agent/config`
   */
  configDir?: string;
  /** If true, suppress all warnings. */
  silent?: boolean;
}

// ── Validation ────────────────────────────────────────────────────────────────

/** Result of validating a single config file. */
export interface ValidationResult {
  file: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Result of validating all config files together. */
export interface AllConfigsResult {
  valid: boolean;
  results: ValidationResult[];
  secrets: {
    api_keys: boolean;
  };
  legacy_layout: boolean;
}
