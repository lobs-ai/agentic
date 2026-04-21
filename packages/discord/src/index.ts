/**
 * @agentic/discord — Discord bot integration for AgenticRuntime.
 *
 * ## Simple usage (runtime-based)
 * ```ts
 * import { AgenticRuntime } from "agentic";
 * import { DiscordBot, loadDiscordConfig } from "@agentic/discord";
 *
 * const config = loadDiscordConfig();
 * if (!config) process.exit(0);
 *
 * const runtime = await AgenticRuntime.fromConfig();
 * const bot = new DiscordBot({
 *   runtime,
 *   config,
 *   systemPrompt: "You are a helpful assistant.",
 * });
 *
 * await bot.start();
 * await bot.service.send(config.channels?.alerts!, "Bot started!");
 * ```
 *
 * ## Existing system (agentFactory)
 * ```ts
 * // Your existing agent setup stays untouched:
 * const chatAgent = runtime.defineAgent({
 *   name: "chat",
 *   model: "claude-sonnet-4-6",
 *   systemPrompt: "You are a helpful study assistant.",
 *   tools: ["read", "grep"],
 * });
 *
 * // Plug Discord in on top:
 * const bot = new DiscordBot({
 *   config,
 *   agentFactory: (msg) => chatAgent(),
 * });
 *
 * await bot.start();
 * ```
 *
 * ## Manual tool registration
 * ```ts
 * // Register DiscordTool yourself (e.g. for a scoped registry):
 * const bot = new DiscordBot({ config, runtime, registerDiscordTool: false });
 * await bot.start();
 * runtime.tool(createDiscordTool(bot.service));
 * ```
 */

export { DiscordBot } from "./bot.js";
export type { DiscordBotOptions, Agent } from "./bot.js";

export { DiscordService } from "./service.js";

export { DiscordTool } from "./tool.js";

export { DiscordSessionManager } from "./sessions.js";

export { loadDiscordConfig } from "./config.js";

export type {
  DiscordBotConfig,
  ChannelPolicy,
  InboundMessage,
  DiscordEmbed,
  EmbedField,
  FetchedMessage,
} from "./types.js";

/**
 * Create a `DiscordTool` bound to an existing `DiscordService`.
 *
 * Use this when you want to register the Discord tool yourself instead
 * of relying on `DiscordBot.start()` to do it automatically.
 *
 * @example
 * ```ts
 * const bot = new DiscordBot({ config, runtime, registerDiscordTool: false });
 * await bot.start();
 * runtime.tool(createDiscordTool(bot.service));
 * ```
 */
export { createDiscordTool } from "./tool.js";
