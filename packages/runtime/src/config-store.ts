/**
 * ConfigStore — read, edit, and save agent config without touching the format.
 *
 * Supports YAML, JSON, and code-level configs. YAML is the primary format
 * (human-readable, supports comments, no required quoting).
 *
 * @example Load and modify
 * ```ts
 * const store = await ConfigStore.load();
 *
 * store
 *   .addKey("anthropic", process.env.ANTHROPIC_API_KEY!, "primary")
 *   .setFallback("anthropic", ["openai/gpt-4o"])
 *   .setDefaultModel("claude-sonnet-4-6");
 *
 * await store.save(); // writes back to the same file
 * ```
 *
 * @example Create from scratch and save as YAML
 * ```ts
 * const store = ConfigStore.from({
 *   defaults: { model: "claude-sonnet-4-6" },
 * });
 * await store.save("./agentic.yaml");
 * ```
 */

import { writeFileSync } from "node:fs";
import { extname } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { findConfigFile, parseConfigFile } from "./config-loader.js";
import type { AgenticConfig, KeyEntry, KeyRotation } from "./types.js";

// ── Dot-path helpers ──────────────────────────────────────────────────────────

function getByPath(obj: unknown, path: string): unknown {
  let cur = obj;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function deepMerge(base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (v === undefined) continue;
    if (v && typeof v === "object" && !Array.isArray(v) && result[k] && typeof result[k] === "object" && !Array.isArray(result[k])) {
      result[k] = deepMerge(result[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ── ConfigStore ───────────────────────────────────────────────────────────────

export class ConfigStore {
  private _config: AgenticConfig;
  private _filePath: string | null;

  private constructor(config: AgenticConfig, filePath: string | null) {
    this._config = config;
    this._filePath = filePath;
  }

  // ── Factory methods ──────────────────────────────────────────────────────────

  /** Create a ConfigStore from an existing config object (not backed by a file). */
  static from(config: AgenticConfig): ConfigStore {
    return new ConfigStore(config, null);
  }

  /**
   * Load a ConfigStore from a file or directory.
   *
   * @param pathOrDir
   *   - Omit → search `process.cwd()` for `agentic.yaml` / `agentic.config.*`
   *   - Directory path → search that directory
   *   - File path → load that exact file
   *
   * Returns an empty store when no file is found.
   */
  static async load(pathOrDir?: string): Promise<ConfigStore> {
    const filePath = findConfigFile(pathOrDir);
    if (!filePath) return new ConfigStore({}, null);
    try {
      const config = await parseConfigFile(filePath);
      return new ConfigStore(config, filePath);
    } catch (err) {
      throw new Error(`[agentic] Failed to load config from ${filePath}: ${err}`);
    }
  }

  // ── Accessors ────────────────────────────────────────────────────────────────

  /** The raw config object. */
  get config(): AgenticConfig {
    return this._config;
  }

  /** The path this store was loaded from, or null if created inline. */
  get filePath(): string | null {
    return this._filePath;
  }

  // ── Read / write ─────────────────────────────────────────────────────────────

  /**
   * Get a config value by dot-path.
   *
   * @example
   * ```ts
   * store.get("defaults.model");       // "claude-sonnet-4-6"
   * store.get("resilience.retries");   // 3
   * ```
   */
  get<T = unknown>(path: string): T | undefined {
    return getByPath(this._config, path) as T | undefined;
  }

  /**
   * Set a config value by dot-path. Creates intermediate objects as needed.
   * Returns `this` for chaining.
   *
   * @example
   * ```ts
   * store.set("defaults.model", "claude-sonnet-4-6")
   *      .set("resilience.retries", 5);
   * ```
   */
  set(path: string, value: unknown): this {
    const copy = JSON.parse(JSON.stringify(this._config)) as Record<string, unknown>;
    setByPath(copy, path, value);
    this._config = copy as AgenticConfig;
    return this;
  }

  /**
   * Deep-merge a partial config into the current config. Arrays are replaced,
   * not concatenated.
   */
  merge(partial: Partial<AgenticConfig>): this {
    this._config = deepMerge(
      this._config as Record<string, unknown>,
      partial as Record<string, unknown>,
    ) as AgenticConfig;
    return this;
  }

  // ── Serialization ─────────────────────────────────────────────────────────────

  /** Serialize the config to YAML. */
  toYaml(): string {
    return stringifyYaml(this._config);
  }

  /** Serialize the config to JSON. */
  toJson(indent = 2): string {
    return JSON.stringify(this._config, null, indent);
  }

  /**
   * Save the config back to disk.
   *
   * @param filePath Destination path. Defaults to the path this store was loaded from.
   *                 Extension determines format: `.yaml`/`.yml` → YAML, all others → JSON.
   *
   * @throws When no file path is known and none is provided.
   */
  async save(filePath?: string): Promise<void> {
    const target = filePath ?? this._filePath;
    if (!target) {
      throw new Error("[agentic] ConfigStore has no file path — pass one to save().");
    }
    const ext = extname(target).toLowerCase();
    const content = ext === ".yaml" || ext === ".yml" ? this.toYaml() : this.toJson();
    writeFileSync(target, content, "utf-8");
    this._filePath = target;
  }

  // ── Key management helpers ────────────────────────────────────────────────────

  /**
   * Add an API key for a provider.
   *
   * @example
   * ```ts
   * store.addKey("anthropic", process.env.ANTHROPIC_API_KEY!, "primary");
   * store.addKey("openai", process.env.OPENAI_API_KEY!);
   * ```
   */
  addKey(provider: string, key: string, label?: string): this {
    const entry: KeyEntry = label ? { key, label } : key;
    const providers = { ...(this._config.providers ?? {}) };
    providers[provider] = {
      ...(providers[provider] ?? {}),
      keys: [...(providers[provider]?.keys ?? []), entry],
    };
    this._config = { ...this._config, providers };
    return this;
  }

  /**
   * Remove a key from a provider pool by key value or label.
   */
  removeKey(provider: string, keyOrLabel: string): this {
    const providers = { ...(this._config.providers ?? {}) };
    const cfg = providers[provider];
    if (!cfg?.keys) return this;
    providers[provider] = {
      ...cfg,
      keys: cfg.keys.filter((k) => {
        const e = typeof k === "string" ? { key: k } : k;
        return e.key !== keyOrLabel && e.label !== keyOrLabel;
      }),
    };
    this._config = { ...this._config, providers };
    return this;
  }

  /**
   * Set the key rotation strategy for a provider.
   */
  setRotation(provider: string, rotation: KeyRotation): this {
    const providers = { ...(this._config.providers ?? {}) };
    providers[provider] = { ...(providers[provider] ?? {}), rotation };
    this._config = { ...this._config, providers };
    return this;
  }

  /**
   * Set the fallback model chain for a provider.
   *
   * @example
   * ```ts
   * store.setFallback("anthropic", ["openai/gpt-4o", "groq/llama3-70b-8192"]);
   * ```
   */
  setFallback(provider: string, models: string[]): this {
    const providers = { ...(this._config.providers ?? {}) };
    providers[provider] = { ...(providers[provider] ?? {}), fallbackTo: models };
    this._config = { ...this._config, providers };
    return this;
  }

  // ── Convenience setters ───────────────────────────────────────────────────────

  /** Set the default model string. */
  setDefaultModel(model: string): this {
    return this.set("defaults.model", model);
  }

  /** Set the global retry count. */
  setRetries(retries: number): this {
    return this.set("resilience.retries", retries);
  }

  /** Set the initial backoff delay in milliseconds. */
  setBackoff(backoffMs: number): this {
    return this.set("resilience.backoffMs", backoffMs);
  }
}
