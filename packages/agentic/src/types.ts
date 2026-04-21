/**
 * AgenticConfig — top-level configuration for AgenticRuntime.
 *
 * Can be loaded from:
 *   - agentic.yaml / agentic.yml   (recommended for human-edited config)
 *   - agentic.json                 (programmatic)
 *   - agentic.config.ts / .js      (code-level, supports functions)
 *
 * Use `ConfigStore` to read, edit, and save config without touching the format.
 */

import type { BaseTool, ToolEntry, ToolRegistry } from "@agentic/tools";
import type { AgentContext } from "@agentic/runner";

// ── Key management ────────────────────────────────────────────────────────────

/**
 * A single API key entry. Use a plain string for simple cases, or an object
 * to add a label (useful for tracking which key is active in logs).
 */
export type KeyEntry = string | { key: string; label?: string };

/**
 * How to rotate through multiple API keys for the same provider.
 *
 * - `"sticky"` (default) — same session always gets the same key, maximising
 *   prompt-cache hits.
 * - `"round-robin"` — distribute requests evenly across all keys.
 * - `"least-used"` — always pick the key with the fewest recent calls.
 */
export type KeyRotation = "sticky" | "round-robin" | "least-used";

// ── Provider config ───────────────────────────────────────────────────────────

/**
 * Configuration for a single provider. Works for both built-in providers
 * (anthropic, openai, groq, etc.) and custom endpoints.
 *
 * @example built-in provider with multiple keys + fallback
 * ```yaml
 * providers:
 *   anthropic:
 *     keys:
 *       - ${ANTHROPIC_API_KEY}
 *       - key: ${ANTHROPIC_KEY_2}
 *         label: backup
 *     rotation: sticky
 *     fallbackTo:
 *       - openai/gpt-4o
 *       - groq/llama3-70b-8192
 * ```
 *
 * @example custom OpenAI-compatible endpoint
 * ```yaml
 * providers:
 *   my-ollama:
 *     type: openai-compatible
 *     baseUrl: http://localhost:11434/v1
 * ```
 */
export interface ProviderConfig {
  /**
   * API protocol. Only required for providers not built into the routing table.
   * Built-in providers (anthropic, openai, groq, deepseek, google, mistral,
   * ollama, openrouter, etc.) are auto-routed without this field.
   */
  type?: "openai-compatible" | "anthropic" | "openai";

  /** Base URL. Required for custom openai-compatible providers. */
  baseUrl?: string;

  /** Additional headers sent with every request to this provider. */
  headers?: Record<string, string>;

  /**
   * API key(s) for this provider.
   *
   * When multiple keys are provided, the runtime rotates through them
   * according to the `rotation` strategy.
   *
   * Falls back to environment variables when omitted:
   * `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, etc.
   */
  keys?: KeyEntry[];

  /**
   * Key rotation strategy when multiple keys are configured.
   * Default: `"sticky"`.
   */
  rotation?: KeyRotation;

  /**
   * Fallback model strings to try when this provider fails.
   * Each entry is a full `"provider/model-id"` string (or bare model id
   * for auto-routing).
   *
   * @example `["openai/gpt-4o", "groq/llama3-70b-8192"]`
   */
  fallbackTo?: string[];
}

// ── Resilience config ─────────────────────────────────────────────────────────

/**
 * Global resilience settings applied to all LLM calls.
 */
export interface ResilienceConfig {
  /**
   * Maximum retries per model before moving to the next fallback.
   * Default: 3.
   */
  retries?: number;

  /**
   * Initial backoff delay in milliseconds before the first retry.
   * Uses exponential backoff. Default: 1000.
   */
  backoffMs?: number;

  /**
   * Maximum backoff delay in milliseconds. Default: 30000.
   */
  maxBackoffMs?: number;

  /** Circuit breaker configuration. */
  circuitBreaker?: {
    /**
     * Whether circuit breaking is enabled. Default: true.
     */
    enabled?: boolean;

    /**
     * Number of failures within the window before the circuit opens.
     * Default: 10.
     */
    failureThreshold?: number;

    /**
     * Minutes to wait after opening before trying again (half-open).
     * Default: 30.
     */
    cooldownMinutes?: number;

    /**
     * Rolling window in minutes for counting failures.
     * Default: 60.
     */
    windowMinutes?: number;
  };
}

// ── Context engine config ─────────────────────────────────────────────────────

/**
 * Declarative context engine configuration.
 *
 * - `"truncating"` — keeps first message + recent turns, truncates old tool results
 * - `"noop"` — never compacts (for unlimited-context models like Gemini 2.0 Flash)
 * - `"module"` — load a custom `ContextEngine` from a JS/TS file
 */
export type ContextEngineConfig =
  | {
      type: "truncating";
      /** How many recent LLM turns to keep verbatim. Default: 5 */
      keepRecentTurns?: number;
      /** Fraction of context limit at which to compact (0–1). Default: 0.8 */
      compactThreshold?: number;
    }
  | { type: "noop" }
  | {
      type: "module";
      /** Path to a module that default-exports a `ContextEngine` instance. */
      path: string;
    };

// ── Tool selector ─────────────────────────────────────────────────────────────

/**
 * A function that decides which tools are available for a given agent run.
 *
 * Called synchronously when `AgenticRuntime.agent()` is invoked. Return a
 * list of tool names to enable, or `undefined`/`null` to use all registered
 * tools.
 *
 * Only usable in code-level configs (`.ts` / `.js`) — not in YAML/JSON.
 *
 * @example role-based selection
 * ```ts
 * select(registry, context) {
 *   if (context?.notes?.includes("readonly")) return ["read", "grep", "glob"];
 *   return undefined; // all tools
 * }
 * ```
 *
 * @example environment-based selection
 * ```ts
 * select(registry) {
 *   const allowed = process.env.ALLOWED_TOOLS?.split(",") ?? registry.names();
 *   return registry.names().filter(n => allowed.includes(n));
 * }
 * ```
 */
export type ToolSelector = (
  registry: ToolRegistry,
  context?: AgentContext,
) => string[] | undefined | null;

// ── Tools config ──────────────────────────────────────────────────────────────

export type ToolDirEntry = string | { dir: string; pattern?: string };

/**
 * Unified tool source configuration.
 *
 * All sources are additive and applied in order:
 * `builtins` → `files` → `dirs` → `instances` → `register` → `select` (at run time)
 */
export interface ToolsConfig {
  /**
   * Which built-in tools to include.
   * - `"all"` (default) — all 9 built-ins
   * - `"none"` — no built-ins
   * - `string[]` — explicit whitelist, e.g. `["read", "exec", "grep"]`
   */
  builtins?: "all" | "none" | string[];

  /**
   * Exact file paths to load tools from. Each file's BaseTool exports are
   * registered automatically.
   */
  files?: string[];

  /**
   * Directories to scan with optional glob pattern filtering.
   *
   * @example `"./tools"` — all .ts/.js files
   * @example `{ dir: "./src", pattern: "*.tool.ts" }` — only matching files
   */
  dirs?: ToolDirEntry[];

  /** Direct `BaseTool` or raw `ToolEntry` instances. */
  instances?: Array<BaseTool | ToolEntry>;

  /**
   * Imperative registration hook. Receives the registry after all other
   * sources are processed — use this for full programmatic control.
   */
  register?: (registry: ToolRegistry) => void | Promise<void>;

  /**
   * Runtime tool selector. Called each time `AgenticRuntime.agent()` is
   * invoked to filter which registered tools are available for that run.
   *
   * Only usable in code-level configs (`.ts` / `.js`).
   */
  select?: ToolSelector;
}

// ── Agent defaults ────────────────────────────────────────────────────────────

export interface AgentDefaults {
  /** Default model string (e.g. `"claude-sonnet-4-6"`). */
  model?: string;
  /** Default working directory. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Default timeout in seconds. Default: 300 */
  timeout?: number;
  /** Default maximum LLM turns. Default: 100 */
  maxTurns?: number;
  /** Default maximum tokens per response. Default: 16384 */
  maxTokens?: number;
  /** Default system prompt. */
  systemPrompt?: string;
}

// ── Top-level config ──────────────────────────────────────────────────────────

export interface AgenticConfig {
  /**
   * Provider configurations.
   *
   * Keys are provider names used in `"provider/model-id"` strings. Built-in
   * providers (anthropic, openai, groq, deepseek, google, mistral, ollama,
   * openrouter, etc.) work out of the box from env vars — only configure here
   * when you need multiple keys, fallbacks, or custom endpoints.
   */
  providers?: Record<string, ProviderConfig>;

  /**
   * Global resilience settings: retries, backoff, circuit breaker.
   */
  resilience?: ResilienceConfig;

  /**
   * Tool sources and runtime selection. All sources are additive.
   */
  tools?: ToolsConfig;

  /**
   * Context engine configuration. Defaults to `TruncatingContextEngine`
   * (80% threshold, 5 recent turns).
   */
  contextEngine?: ContextEngineConfig;

  /**
   * Default values applied to every `AgenticRuntime.agent()` call.
   */
  defaults?: AgentDefaults;
}
