/**
 * API key management — load from config files, env vars, or direct objects.
 *
 * Supports multiple keys per provider with sticky-failover strategy.
 * Keys are loaded from:
 *   1. {configDir}/secrets/keys.json  (preferred)
 *   2. {configDir}/keys.json          (legacy)
 *   3. PROVIDER_API_KEYS env vars     (override)
 *   4. PROVIDER_API_KEY env vars      (single-key fallback)
 */
import type { KeyEntry, KeyPool, KeyConfig } from "./types.js";
export type { KeyEntry, KeyPool, KeyConfig };
/**
 * Get the environment variable name for a provider's API key.
 * Falls back to `{PROVIDER}_API_KEY` for unknown providers.
 */
export declare function getEnvKeyForProvider(provider: string): string;
/**
 * Normalize raw JSON data into a valid KeyConfig.
 * Reads all providers present in the data — not a hardcoded list.
 */
export declare function normalizeKeyConfig(data: unknown): KeyConfig;
/**
 * Load all key pools from config files and environment variables.
 *
 * Priority (highest first):
 *   1. Plural env vars (e.g. ANTHROPIC_API_KEYS=sk-a,sk-b)
 *   2. Config file (secrets/keys.json or keys.json)
 *   3. Single env vars (e.g. ANTHROPIC_API_KEY=sk-a)
 *
 * After loading, injects the first key of each provider into process.env
 * so downstream SDK clients can find them automatically.
 *
 * @param configDir - Override the config directory (default: getConfigDir())
 * @param silent - Suppress warnings about missing files or deprecated layouts
 * @param injectEnv - Whether to inject keys into process.env (default: true)
 */
export declare function loadKeyConfig(opts?: {
    configDir?: string;
    silent?: boolean;
    injectEnv?: boolean;
}): KeyConfig;
/**
 * Get the first key for a provider, or undefined if none is configured.
 * Convenience wrapper around loadKeyConfig().
 */
export declare function getFirstKey(provider: string, opts?: {
    configDir?: string;
}): string | undefined;
/**
 * Check whether a provider has at least one key configured.
 */
export declare function hasKeyForProvider(provider: string, opts?: {
    configDir?: string;
}): boolean;
/**
 * Build a KeyConfig directly from a plain object of provider → key(s).
 * Useful for passing keys programmatically.
 *
 * @example
 * const keys = buildKeyConfig({ anthropic: "sk-ant-...", openai: ["sk-1", "sk-2"] });
 */
export declare function buildKeyConfig(input: Record<string, string | string[]>): KeyConfig;
//# sourceMappingURL=keys.d.ts.map