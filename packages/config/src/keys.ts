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

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { KeyEntry, KeyPool, KeyConfig } from "./types.js";
import { getConfigDir } from "./loader.js";

export type { KeyEntry, KeyPool, KeyConfig };

// ── Provider → env var mapping ────────────────────────────────────────────────

/**
 * Maps provider names to their canonical single-key environment variable.
 * Any unmapped provider falls back to {PROVIDER}_API_KEY.
 */
const PROVIDER_ENV_MAP: Record<string, string> = {
  anthropic:      "ANTHROPIC_API_KEY",
  openai:         "OPENAI_API_KEY",
  "openai-codex": "OPENAI_CODEX_TOKEN",
  openrouter:     "OPENROUTER_API_KEY",
  "z-ai":         "ZAI_API_KEY",
  minimax:        "MINIMAX_API_KEY",
  kimi:           "KIMI_API_KEY",
};

/**
 * Maps provider names to plural env vars holding comma-separated keys.
 * These take precedence over config files when set.
 */
const PROVIDER_PLURAL_ENV: Record<string, string> = {
  anthropic:      "ANTHROPIC_API_KEYS",
  openai:         "OPENAI_API_KEYS",
  openrouter:     "OPENROUTER_API_KEYS",
  "openai-codex": "OPENAI_CODEX_TOKENS",
};

/**
 * Get the environment variable name for a provider's API key.
 * Falls back to `{PROVIDER}_API_KEY` for unknown providers.
 */
export function getEnvKeyForProvider(provider: string): string {
  return PROVIDER_ENV_MAP[provider]
    ?? `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
}

// ── Normalization helpers ─────────────────────────────────────────────────────

function normalizeKeyEntries(entries: unknown): KeyEntry[] {
  if (!Array.isArray(entries)) return [];

  const normalized: Array<KeyEntry | undefined> = entries.map((entry, idx) => {
    if (typeof entry === "string") {
      const key = entry.trim();
      return key ? { key, label: `key-${idx + 1}` } : undefined;
    }

    if (entry && typeof entry === "object" && typeof (entry as { key?: unknown }).key === "string") {
      const key = (entry as { key: string }).key.trim();
      if (!key) return undefined;
      const label =
        typeof (entry as { label?: unknown }).label === "string"
          ? (entry as { label?: string }).label
          : undefined;
      return { key, label };
    }

    return undefined;
  });

  return normalized.filter((entry): entry is KeyEntry => entry !== undefined);
}

function dedupeKeyEntries(entries: KeyEntry[], provider?: string): KeyEntry[] {
  const seen = new Set<string>();
  const deduped: KeyEntry[] = [];

  for (const entry of entries) {
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    deduped.push(entry);
  }

  if (provider && deduped.length !== entries.length) {
    const removed = entries.length - deduped.length;
    console.warn(
      `[config/keys] Removed ${removed} duplicate ${provider} key entr${removed === 1 ? "y" : "ies"}`
    );
  }

  return deduped;
}

function normalizePool(pool: unknown): KeyPool | undefined {
  // Current format: { keys: [...], strategy: "sticky-failover" }
  if (pool && typeof pool === "object" && Array.isArray((pool as { keys?: unknown }).keys)) {
    const keys = dedupeKeyEntries(normalizeKeyEntries((pool as { keys: unknown }).keys));
    if (keys.length === 0) return undefined;
    return { keys, strategy: "sticky-failover" };
  }

  // Legacy / array format: ["sk-..."] or [{ key, label }]
  const keys = dedupeKeyEntries(normalizeKeyEntries(pool));
  if (keys.length === 0) return undefined;
  return { keys, strategy: "sticky-failover" };
}

/**
 * Normalize raw JSON data into a valid KeyConfig.
 * Reads all providers present in the data — not a hardcoded list.
 */
export function normalizeKeyConfig(data: unknown): KeyConfig {
  if (!data || typeof data !== "object") return {};

  const raw = data as Record<string, unknown>;
  const config: KeyConfig = {};

  for (const [provider, poolData] of Object.entries(raw)) {
    const pool = normalizePool(poolData);
    if (pool) {
      config[provider] = pool;
    }
  }

  return config;
}

// ── File loading ──────────────────────────────────────────────────────────────

function loadConfigFile(configDir: string, silent = false): KeyConfig | undefined {
  const newPath = resolve(configDir, "secrets", "keys.json");
  const legacyPath = resolve(configDir, "keys.json");

  if (existsSync(newPath)) {
    try {
      const data = JSON.parse(readFileSync(newPath, "utf-8"));
      return normalizeKeyConfig(data);
    } catch (err) {
      if (!silent) console.warn(`[config/keys] Failed to load ${newPath}:`, err);
      return undefined;
    }
  }

  if (existsSync(legacyPath)) {
    if (!silent) {
      console.warn("[config/keys] DEPRECATED: keys.json in config root — migrate to secrets/keys.json");
    }
    try {
      const data = JSON.parse(readFileSync(legacyPath, "utf-8"));
      return normalizeKeyConfig(data);
    } catch (err) {
      if (!silent) console.warn(`[config/keys] Failed to load ${legacyPath}:`, err);
      return undefined;
    }
  }

  return undefined;
}

function parseEnvKeys(envVar: string): KeyEntry[] | undefined {
  const value = process.env[envVar];
  if (!value) return undefined;

  const keys = value.split(",").map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) return undefined;

  return keys.map((key, idx) => ({ key, label: `env-${idx + 1}` }));
}

// ── Public API ────────────────────────────────────────────────────────────────

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
export function loadKeyConfig(opts?: {
  configDir?: string;
  silent?: boolean;
  injectEnv?: boolean;
}): KeyConfig {
  const configDir = opts?.configDir ?? getConfigDir();
  const silent = opts?.silent ?? false;
  const injectEnv = opts?.injectEnv ?? true;

  // Start with file config
  const fileConfig = loadConfigFile(configDir, silent) ?? {};
  const config: KeyConfig = { ...fileConfig };

  // Plural env vars override file config
  for (const [provider, envVar] of Object.entries(PROVIDER_PLURAL_ENV)) {
    const keys = parseEnvKeys(envVar);
    if (keys) {
      config[provider] = { keys: dedupeKeyEntries(keys, provider), strategy: "sticky-failover" };
    }
  }

  // Single env vars fill gaps (providers not in file or plural env)
  for (const [provider, envVar] of Object.entries(PROVIDER_ENV_MAP)) {
    if (!config[provider]) {
      const value = process.env[envVar]?.trim();
      if (value) {
        config[provider] = { keys: [{ key: value, label: "env" }], strategy: "sticky-failover" };
      }
    }
  }

  // Inject first key of each provider into process.env
  if (injectEnv) {
    for (const [provider, pool] of Object.entries(config)) {
      if (pool.keys.length > 0 && pool.keys[0].key) {
        const envKey = getEnvKeyForProvider(provider);
        if (!process.env[envKey]) {
          process.env[envKey] = pool.keys[0].key;
        }
      }
    }
  }

  return config;
}

/**
 * Get the first key for a provider, or undefined if none is configured.
 * Convenience wrapper around loadKeyConfig().
 */
export function getFirstKey(provider: string, opts?: { configDir?: string }): string | undefined {
  const config = loadKeyConfig({ ...opts, injectEnv: false });
  return config[provider]?.keys[0]?.key;
}

/**
 * Check whether a provider has at least one key configured.
 */
export function hasKeyForProvider(provider: string, opts?: { configDir?: string }): boolean {
  return getFirstKey(provider, opts) !== undefined;
}

/**
 * Build a KeyConfig directly from a plain object of provider → key(s).
 * Useful for passing keys programmatically.
 *
 * @example
 * const keys = buildKeyConfig({ anthropic: "sk-ant-...", openai: ["sk-1", "sk-2"] });
 */
export function buildKeyConfig(input: Record<string, string | string[]>): KeyConfig {
  const config: KeyConfig = {};

  for (const [provider, value] of Object.entries(input)) {
    const rawKeys = Array.isArray(value) ? value : [value];
    const entries = normalizeKeyEntries(rawKeys);
    if (entries.length > 0) {
      config[provider] = { keys: entries, strategy: "sticky-failover" };
    }
  }

  return config;
}
