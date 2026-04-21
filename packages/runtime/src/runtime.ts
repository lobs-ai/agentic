/**
 * AgenticRuntime — the top-level orchestrator.
 *
 * Wires together a tool registry (with auto-discovery), a context engine,
 * provider resolution, key management, and resilience settings into a single
 * object. Create it once; use it many times.
 *
 * @example Quick start
 * ```ts
 * import { AgenticRuntime } from "agentic";
 *
 * const rt = await AgenticRuntime.fromConfig(); // reads agentic.yaml
 *
 * const result = await rt.agent({
 *   model: "claude-sonnet-4-6",
 *   cwd: process.cwd(),
 *   timeout: 300,
 * }).run("Summarize the README.");
 *
 * console.log(result.output);
 * ```
 *
 * @example Inline config
 * ```ts
 * const rt = await AgenticRuntime.create({
 *   providers: {
 *     anthropic: {
 *       keys: [process.env.ANTHROPIC_API_KEY!],
 *       fallbackTo: ["openai/gpt-4o"],
 *     },
 *     "local-llama": {
 *       type: "openai-compatible",
 *       baseUrl: "http://localhost:11434/v1",
 *     },
 *   },
 *   resilience: { retries: 5 },
 *   defaults: { model: "claude-sonnet-4-6", timeout: 300 },
 * });
 * ```
 */

import {
  createResilientClient,
  configureKeyManager,
  parseModelString,
  type LLMClient,
  type KeyManagerConfig,
} from "@agentic/llm";
import {
  ToolRegistry,
  BUILTIN_TOOLS,
  type BaseTool,
  type ToolEntry,
} from "@agentic/tools";
import {
  Agent,
  type ContextEngine,
  type AgentConfig,
  type AgentContext,
} from "@agentic/runner";
import { discoverTools, loadToolFile } from "./discover.js";
import { createContextEngine } from "./context-factory.js";
import { buildCustomClient } from "./provider-factory.js";
import { loadConfigFile } from "./config-loader.js";
import { extract as extractUtil, type ExtractOptions } from "./output.js";
import type {
  AgenticConfig,
  AgentDefaults,
  ToolsConfig,
  ProviderConfig,
  ResilienceConfig,
  ToolSelector,
  KeyEntry,
} from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeKey(entry: KeyEntry): { key: string; label?: string } {
  return typeof entry === "string" ? { key: entry } : entry;
}

async function buildRegistry(registry: ToolRegistry, cfg: ToolsConfig = {}): Promise<void> {
  const builtinSpec = cfg.builtins ?? "all";
  if (builtinSpec === "all") {
    registry.registerAll([...BUILTIN_TOOLS]);
  } else if (Array.isArray(builtinSpec)) {
    registry.registerAll([...BUILTIN_TOOLS].filter((t) => builtinSpec.includes(t.name)));
  }

  for (const file of cfg.files ?? []) {
    const found = await loadToolFile(file);
    if (found.length > 0) registry.registerAll(found);
  }

  for (const entry of cfg.dirs ?? []) {
    const { dir, pattern } =
      typeof entry === "string" ? { dir: entry, pattern: undefined } : entry;
    const found = await discoverTools(dir, pattern);
    if (found.length > 0) {
      registry.registerAll(found);
      console.log(
        `[agentic] Loaded ${found.length} tool(s) from ${dir}${pattern ? ` (${pattern})` : ""}: ${found.map((t) => t.name).join(", ")}`,
      );
    }
  }

  if (cfg.instances) registry.registerAll(cfg.instances);
  if (cfg.register) await cfg.register(registry);
}

function buildKeyManagerConfig(providers: Record<string, ProviderConfig>): KeyManagerConfig {
  const km: KeyManagerConfig = {};
  for (const [name, cfg] of Object.entries(providers)) {
    if (cfg.keys && cfg.keys.length > 0) {
      km[name] = { keys: cfg.keys.map(normalizeKey) };
    }
  }
  return km;
}

// ── AgenticRuntime ────────────────────────────────────────────────────────────

export class AgenticRuntime {
  private readonly _registry: ToolRegistry;
  private readonly _contextEngine: ContextEngine;
  private readonly _providers: Map<string, ProviderConfig>;
  private readonly _resilience: ResilienceConfig;
  private _toolSelector: ToolSelector | undefined;
  private readonly _defaults: AgentDefaults;

  private constructor(
    registry: ToolRegistry,
    contextEngine: ContextEngine,
    providers: Map<string, ProviderConfig>,
    resilience: ResilienceConfig,
    toolSelector: ToolSelector | undefined,
    defaults: AgentDefaults,
  ) {
    this._registry = registry;
    this._contextEngine = contextEngine;
    this._providers = providers;
    this._resilience = resilience;
    this._toolSelector = toolSelector;
    this._defaults = defaults;
  }

  // ── Factory methods ──────────────────────────────────────────────────────────

  /**
   * Create a runtime from an inline config object.
   * This is the primary factory — all other factories call it.
   */
  static async create(config: AgenticConfig = {}): Promise<AgenticRuntime> {
    const registry = new ToolRegistry();
    await buildRegistry(registry, config.tools);

    const contextEngine = await createContextEngine(config.contextEngine);

    const providers = new Map<string, ProviderConfig>(
      Object.entries(config.providers ?? {}),
    );

    // Wire API keys into the global KeyManager
    if (config.providers) {
      const kmCfg = buildKeyManagerConfig(config.providers);
      if (Object.keys(kmCfg).length > 0) configureKeyManager(kmCfg);
    }

    return new AgenticRuntime(
      registry,
      contextEngine,
      providers,
      config.resilience ?? {},
      config.tools?.select,
      config.defaults ?? {},
    );
  }

  /**
   * Load config and create a runtime.
   *
   * @param pathOrDir
   *   - Omit → search `process.cwd()` for `agentic.yaml` / `agentic.config.*`
   *   - Directory path → search that directory
   *   - File path → load that exact file
   */
  static async fromConfig(pathOrDir?: string): Promise<AgenticRuntime> {
    const config = await loadConfigFile(pathOrDir);
    return AgenticRuntime.create(config);
  }

  // ── Accessors ────────────────────────────────────────────────────────────────

  get toolRegistry(): ToolRegistry {
    return this._registry;
  }

  get contextEngine(): ContextEngine {
    return this._contextEngine;
  }

  // ── Runtime mutation ─────────────────────────────────────────────────────────

  /**
   * Register an additional tool without rebuilding the runtime.
   * Returns `this` for chaining.
   */
  tool(tool: BaseTool | ToolEntry): this {
    this._registry.register(tool);
    return this;
  }

  /**
   * Register a custom provider without rebuilding the runtime.
   * Returns `this` for chaining.
   *
   * @example
   * ```ts
   * runtime.provider("my-proxy", {
   *   type: "openai-compatible",
   *   baseUrl: "https://my-proxy.example.com/v1",
   * });
   * ```
   */
  provider(name: string, def: ProviderConfig): this {
    this._providers.set(name.toLowerCase(), def);
    return this;
  }

  // ── Hot config reload ────────────────────────────────────────────────────────

  /**
   * Apply a partial config update to the running runtime without restarting.
   *
   * - Provider keys → reconfigures KeyManager immediately; new sessions pick
   *   up the updated pool; in-flight sessions drain with existing keys.
   * - `providers` entries → updated for future `resolveClient()` calls.
   * - `resilience` / `defaults` → merged (individual fields updated, others
   *   preserved). Pass explicit `undefined` values to clear a field.
   * - `tools.select` → replaces the tool selector for future `agent()` calls.
   *
   * @example Rotate in new keys at runtime
   * ```ts
   * await runtime.reload({
   *   providers: {
   *     anthropic: { keys: [newKey1, newKey2] },
   *   },
   * });
   * ```
   */
  async reload(config: Partial<AgenticConfig>): Promise<void> {
    if (config.providers) {
      const kmCfg = buildKeyManagerConfig(config.providers);
      if (Object.keys(kmCfg).length > 0) configureKeyManager(kmCfg);
      for (const [name, def] of Object.entries(config.providers)) {
        this._providers.set(name.toLowerCase(), def);
      }
    }
    if (config.resilience) {
      Object.assign(this._resilience, config.resilience);
    }
    if (config.defaults) {
      Object.assign(this._defaults, config.defaults);
    }
    if (config.tools?.select !== undefined) {
      this._toolSelector = config.tools.select;
    }
  }

  /**
   * Reload config from a file or directory and apply it to the running runtime.
   *
   * @param pathOrDir Same as `fromConfig()` — omit to search `process.cwd()`.
   */
  async reloadFromConfig(pathOrDir?: string): Promise<void> {
    const config = await loadConfigFile(pathOrDir);
    return this.reload(config);
  }

  // ── Client resolution ────────────────────────────────────────────────────────

  /**
   * Resolve a model string to an `LLMClient`.
   *
   * Resolution order:
   * 1. Custom providers with an explicit `type` (custom endpoints)
   * 2. Built-in provider routing + resilience config (retries, fallbacks)
   */
  resolveClient(model: string): LLMClient {
    const slashIdx = model.indexOf("/");
    const providerName = slashIdx !== -1 ? model.slice(0, slashIdx).toLowerCase() : null;

    // Custom endpoint (type is set explicitly)
    if (providerName) {
      const cfg = this._providers.get(providerName);
      if (cfg?.type) {
        return buildCustomClient(cfg, providerName);
      }
    }

    // Built-in routing with resilience options
    const fallbackModels = providerName
      ? (this._providers.get(providerName)?.fallbackTo ?? [])
      : [];
    const maxRetries = this._resilience.retries ?? 3;

    return createResilientClient(model, { fallbackModels, maxRetries });
  }

  // ── Agent creation ───────────────────────────────────────────────────────────

  /**
   * Create an `Agent` wired up with this runtime's tool registry, context
   * engine, and provider resolution.
   *
   * `model`, `cwd`, and `timeout` can be omitted when set in `defaults`.
   *
   * @example
   * ```ts
   * const result = await runtime.agent({
   *   model: "claude-sonnet-4-6",
   *   cwd: process.cwd(),
   *   timeout: 300,
   * }).run("What files are in src/?");
   * ```
   */
  agent(
    config: Partial<AgentConfig> & {
      model?: string;
      cwd?: string;
      timeout?: number;
    } = {},
  ): Agent {
    const model = config.model ?? this._defaults.model;
    const cwd = config.cwd ?? this._defaults.cwd ?? process.cwd();
    const timeout = config.timeout ?? this._defaults.timeout ?? 300;

    if (!model) {
      throw new Error(
        "[agentic] No model specified. Pass model to agent() or set defaults.model in config.",
      );
    }

    // Apply tool selector (falls back to all tools when undefined/null)
    let tools = config.tools;
    if (tools === undefined && this._toolSelector) {
      const selected = this._toolSelector(
        this._registry,
        config.context as AgentContext | undefined,
      );
      if (selected != null) tools = selected;
    }

    const merged: AgentConfig = {
      agent: "agent",
      ...this._defaults,
      ...config,
      model,
      cwd,
      timeout,
      tools,
      toolRegistry: config.toolRegistry ?? this._registry,
      contextEngine: config.contextEngine ?? this._contextEngine,
      clientOverride: config.clientOverride ?? this.resolveClient(model),
    };

    return new Agent(merged);
  }

  // ── Single-turn calls ────────────────────────────────────────────────────────

  /**
   * Make a single LLM call and return the text response.
   *
   * No agent loop, no tools — just a direct completion. Useful for
   * classification, rewriting, summarisation, and other single-step tasks.
   *
   * @example
   * ```ts
   * const summary = await runtime.ask(
   *   "Summarize this in one sentence: " + longText,
   *   { model: "claude-haiku-4-5" },
   * );
   * ```
   */
  async ask(
    prompt: string,
    opts: {
      model?: string;
      system?: string;
      maxTokens?: number;
    } = {},
  ): Promise<string> {
    const model = opts.model ?? this._defaults.model;
    if (!model) {
      throw new Error(
        "[agentic] No model specified. Pass model to ask() or set defaults.model in config.",
      );
    }
    const client = this.resolveClient(model);
    const { modelId } = parseModelString(model);
    const response = await client.createMessage({
      model: modelId,
      system: opts.system ?? "",
      messages: [{ role: "user", content: prompt }],
      tools: [],
      maxTokens: opts.maxTokens ?? 4096,
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.type === "text" ? textBlock.text : "";
  }

  /**
   * Make a single LLM call and return a parsed, optionally validated JSON result.
   *
   * Retries automatically when the model returns unparseable output — each
   * retry shows the model what went wrong so it can self-correct.
   *
   * Pass a `validate` function to enforce a schema (Zod, manual, etc.).
   *
   * @example With Zod validation
   * ```ts
   * const plan = await runtime.extract(
   *   "Extract a task list from: " + taskText,
   *   {
   *     model: "claude-haiku-4-5",
   *     validate: (d) => TaskListSchema.parse(d),
   *   },
   * );
   * ```
   *
   * @example Without validation
   * ```ts
   * const data = await runtime.extract<{ name: string; age: number }>(
   *   "Extract name and age from: John Smith, 30 years old",
   * );
   * ```
   */
  async extract<T = unknown>(
    prompt: string,
    opts: ExtractOptions<T> & { model?: string } = {},
  ): Promise<T> {
    const model = opts.model ?? this._defaults.model;
    if (!model) {
      throw new Error(
        "[agentic] No model specified. Pass model to extract() or set defaults.model in config.",
      );
    }
    const client = this.resolveClient(model);
    return extractUtil(client, model, prompt, opts);
  }

  // ── Named agents ─────────────────────────────────────────────────────────────

  /**
   * Define a reusable named agent with a fixed configuration.
   *
   * Returns a factory function: call it to create a fresh `Agent` instance
   * with the stored defaults. Per-run overrides are still possible via
   * `agent.run(task, overrides)`.
   *
   * Both apps have multiple "roles" (Planner, Monitor, Chat; or onboarding,
   * signal, setup). `defineAgent` is the clean way to capture those.
   *
   * @example
   * ```ts
   * const chatAgent = runtime.defineAgent({
   *   name: "chat",
   *   model: "claude-sonnet-4-6",
   *   systemPrompt: "You are a helpful study assistant.",
   *   tools: ["read", "grep"],
   * });
   *
   * const plannerAgent = runtime.defineAgent({
   *   name: "planner",
   *   model: "claude-opus-4-7",
   *   systemPrompt: "You are a structured planning assistant. Respond with JSON.",
   *   tools: [],
   * });
   *
   * // Use them anywhere:
   * const result = await chatAgent().run("Explain recursion.");
   * const plan = await plannerAgent().run("Plan my week.");
   * ```
   */
  defineAgent(
    config: Partial<AgentConfig> & {
      model?: string;
      cwd?: string;
      timeout?: number;
      /** Human-readable name for logging / identification. */
      name?: string;
    },
  ): () => Agent {
    return () => this.agent({ agent: config.name ?? "agent", ...config });
  }
}
