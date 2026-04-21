/**
 * DiscordBot — wires discord.js to an agentic agent.
 *
 * Two integration modes:
 *
 * 1. **Simple** — pass a runtime; the bot creates agents from it:
 * ```ts
 * const bot = new DiscordBot({
 *   runtime,
 *   config,
 *   systemPrompt: "You are a helpful assistant.",
 * });
 * ```
 *
 * 2. **Existing system** — pass your own pre-configured agent factory so the bot
 *    doesn't touch your runtime setup at all:
 * ```ts
 * const myAgent = runtime.defineAgent({
 *   name: "chat",
 *   model: "claude-sonnet-4-6",
 *   systemPrompt: "...",
 *   tools: ["read", "grep"],
 * });
 *
 * const bot = new DiscordBot({
 *   config,
 *   agentFactory: () => myAgent(),
 * });
 * ```
 */

import type { AgenticRuntime } from "agentic";
import { type Agent, type SessionStore } from "@agentic/runner";
import type { DiscordBotConfig, InboundMessage } from "./types.js";
import { DiscordService } from "./service.js";
import { DiscordSessionManager } from "./sessions.js";
import { DiscordTool } from "./tool.js";

export type { Agent };

// ── Options ───────────────────────────────────────────────────────────────────

export interface DiscordBotOptions {
  /** Discord connection config. */
  config: DiscordBotConfig;

  /**
   * The AgenticRuntime to use for creating agents.
   *
   * Required unless `agentFactory` is provided.
   * When both are provided, `agentFactory` takes precedence for message
   * handling, but `runtime` is still used for tool registration if
   * `registerDiscordTool` is true.
   */
  runtime?: AgenticRuntime;

  /**
   * Custom agent factory for existing systems.
   *
   * Called for each incoming Discord message — return a fully configured
   * `Agent`. The bot calls `.withSession(session).run(message)` on it.
   * When provided, `model`, `timeout`, `tools`, and `systemPrompt` are
   * ignored (configure them on the agent instead).
   *
   * @example Using a named agent
   * ```ts
   * const myAgent = runtime.defineAgent({
   *   name: "chat",
   *   model: "claude-sonnet-4-6",
   *   systemPrompt: "You are a helpful study assistant.",
   *   tools: ["read", "grep"],
   * });
   *
   * const bot = new DiscordBot({
   *   config,
   *   agentFactory: (msg) => myAgent(),
   * });
   * ```
   *
   * @example Per-message agent selection
   * ```ts
   * const bot = new DiscordBot({
   *   config,
   *   agentFactory: (msg) =>
   *     msg.isDm ? dmAgent() : channelAgent(),
   * });
   * ```
   */
  agentFactory?: (msg: InboundMessage) => Agent;

  /**
   * System prompt for the built-in runtime agent.
   * Ignored when `agentFactory` is provided.
   * Default: a generic Discord assistant prompt.
   */
  systemPrompt?: string;

  /**
   * Model for the built-in runtime agent.
   * Ignored when `agentFactory` is provided.
   * Falls back to runtime defaults.
   */
  model?: string;

  /**
   * Max seconds per agent run for the built-in runtime agent.
   * Ignored when `agentFactory` is provided.
   * Default: 120.
   */
  timeout?: number;

  /**
   * Explicit tool names for the built-in runtime agent.
   * Ignored when `agentFactory` is provided.
   * Falls back to all registered tools.
   */
  tools?: string[];

  /**
   * Whether to register `DiscordTool` into the runtime's tool registry
   * when `start()` is called.
   *
   * Default: `true` when `runtime` is provided AND `agentFactory` is not.
   * Set `false` to skip auto-registration (e.g. you registered it yourself
   * or don't want agents to have Discord access).
   *
   * Note: when `agentFactory` is provided this defaults to `false` because
   * the bot doesn't own the agent configuration.
   */
  registerDiscordTool?: boolean;

  /**
   * Session store for persisting conversation history across restarts.
   * When omitted sessions are kept in memory with a TTL.
   */
  sessionStore?: SessionStore;

  /**
   * Show a typing indicator while the agent processes a message.
   * Default: true.
   */
  showTyping?: boolean;

  /**
   * Called after each successful agent run.
   * Useful for logging, analytics, or post-processing the response.
   *
   * @param channelId  The Discord channel the message came from.
   * @param msg        The original inbound message.
   * @param result     The agent result.
   */
  onComplete?: (
    channelId: string,
    msg: InboundMessage,
    result: { output: string; turns: number; costUsd: number },
  ) => void;

  /**
   * Called when an agent run fails.
   * Return a string to send as the error reply, or void to use the default.
   */
  onError?: (channelId: string, msg: InboundMessage, err: unknown) => string | void | Promise<string | void>;
}

// ── DiscordBot ────────────────────────────────────────────────────────────────

export class DiscordBot {
  /** Access the underlying DiscordService for proactive sends, embeds, etc. */
  readonly service: DiscordService;

  private readonly opts: DiscordBotOptions & {
    systemPrompt: string;
    timeout: number;
    showTyping: boolean;
  };
  private readonly sessions: DiscordSessionManager;
  private readonly queues = new Map<string, Promise<void>>();

  constructor(options: DiscordBotOptions) {
    if (!options.runtime && !options.agentFactory) {
      throw new Error("[discord-bot] Either `runtime` or `agentFactory` must be provided");
    }
    this.opts = {
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      timeout: 120,
      showTyping: true,
      ...options,
    };
    this.service = new DiscordService();
    this.sessions = new DiscordSessionManager({
      ttlMs: options.config.sessionTtlMs,
      store: options.sessionStore,
    });
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const { runtime, agentFactory, config } = this.opts;

    // Register the discord tool into the runtime's shared registry unless
    // opted out. Default: only when runtime is provided and no agentFactory
    // (agentFactory callers manage their own tool setup).
    const shouldRegister =
      this.opts.registerDiscordTool ?? (runtime != null && agentFactory == null);
    if (shouldRegister && runtime) {
      runtime.tool(new DiscordTool(this.service));
    }

    await this.service.connect(config);
    this.service.onMessage((msg) => this.enqueue(msg));
    console.log("[discord-bot] Ready — listening for messages");
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.queues.values()]);
    await this.sessions.flush();
    await this.service.disconnect();
    console.log("[discord-bot] Stopped");
  }

  /** Clear a channel's conversation history (e.g. on a /clear command). */
  async clearSession(channelId: string): Promise<void> {
    await this.sessions.clear(channelId);
  }

  // ── Message routing ─────────────────────────────────────────────────────────

  private enqueue(msg: InboundMessage): void {
    const prior = this.queues.get(msg.channelId) ?? Promise.resolve();
    const next = prior
      .then(() => this.process(msg))
      .catch((err) =>
        console.error(`[discord-bot] Unhandled error in ${msg.channelId}:`, err),
      );
    this.queues.set(msg.channelId, next);
    next.finally(() => {
      if (this.queues.get(msg.channelId) === next) this.queues.delete(msg.channelId);
    });
  }

  private async process(msg: InboundMessage): Promise<void> {
    if (this.opts.showTyping) this.service.sendTyping(msg.channelId);

    const session = await this.sessions.get(msg.channelId);
    session._ref().push({ role: "user", content: buildUserContent(msg) });

    const agent = this.resolveAgent(msg);

    try {
      // Pass msg.content as the task for hooks/transcripts — it's not added
      // to messages again because we already seeded the session above.
      const result = await agent.withSession(session).run(msg.content);
      const response = result.output || "(no response)";
      await this.service.send(msg.channelId, response);
      this.opts.onComplete?.(msg.channelId, msg, {
        output: response,
        turns: result.turns,
        costUsd: result.costUsd,
      });
    } catch (err) {
      console.error(`[discord-bot] Agent error in ${msg.channelId}:`, err);
      const reply =
        (await this.opts.onError?.(msg.channelId, msg, err)) ??
        "Sorry, I ran into an error processing your request.";
      await this.service.send(msg.channelId, reply);
    }
  }

  private resolveAgent(msg: InboundMessage): Agent {
    if (this.opts.agentFactory) return this.opts.agentFactory(msg);

    const { runtime, config } = this.opts;
    if (!runtime) throw new Error("[discord-bot] No runtime or agentFactory");

    return runtime.agent({
      model: this.opts.model,
      timeout: this.opts.timeout,
      tools: this.opts.tools,
      systemPrompt: buildSystemPrompt(this.opts.systemPrompt, config),
      context: {
        channelId: msg.channelId,
        notes: buildContextNotes(msg),
      },
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildUserContent(msg: InboundMessage): string | Array<Record<string, unknown>> {
  if (!msg.images?.length) return msg.content || "(empty message)";
  const blocks: Array<Record<string, unknown>> = [
    { type: "text", text: msg.content || "(no text)" },
  ];
  for (const img of msg.images) {
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.data },
    });
  }
  return blocks;
}

function buildContextNotes(msg: InboundMessage): string {
  return [
    `Discord channel: ${msg.channelId}`,
    `Author: ${msg.displayName} (${msg.authorId})`,
    msg.isDm ? "This is a DM conversation." : "This is a guild channel.",
    msg.guildId ? `Guild: ${msg.guildId}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSystemPrompt(base: string, config: DiscordBotConfig): string {
  const extras: string[] = [];
  if (config.guildId) extras.push(`Primary guild ID: ${config.guildId}`);
  if (config.channels?.alerts) extras.push(`Alerts channel: ${config.channels.alerts}`);
  return extras.length ? `${base}\n\n${extras.join("\n")}` : base;
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful Discord bot assistant. \
Keep responses concise — Discord messages have a 2000-character limit, \
so prefer clear, direct answers over lengthy explanations. \
Use Discord markdown formatting where appropriate (bold, italic, code blocks). \
If a task will take multiple steps, briefly outline what you're doing before you start.`;
