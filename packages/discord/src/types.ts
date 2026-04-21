/**
 * Types for @agentic/discord
 */

// ── Channel / guild policies ──────────────────────────────────────────────────

/**
 * Message filtering policy for a channel or guild.
 *
 * Channel policies (keyed by channel snowflake ID) take precedence over guild
 * policies (keyed by guild ID). If neither matches, the message is dropped.
 *
 * @example Allow all messages in this channel:
 * ```json
 * { "allow": true, "requireMention": false }
 * ```
 *
 * @example Only respond when @mentioned:
 * ```json
 * { "allow": true, "requireMention": true }
 * ```
 */
export interface ChannelPolicy {
  /** Allow messages from this channel/guild to reach the agent. */
  allow: boolean;
  /**
   * Only respond when the bot is @mentioned or its name appears in the message
   * (names are configured via `DiscordBotConfig.agentNames`).
   */
  requireMention: boolean;
  /** Silently drop messages from other bots in this channel. */
  dropBotMessages?: boolean;
}

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * Configuration for `DiscordBot`.
 *
 * Can be constructed directly or loaded from `~/.lobs/config/discord.json`
 * via `loadDiscordConfig()`. Environment variables are used as fallbacks for
 * most fields.
 *
 * @example Minimal inline config
 * ```typescript
 * const config: DiscordBotConfig = {
 *   botToken: process.env.DISCORD_BOT_TOKEN!,
 *   dmAllowFrom: ["111222333444555666"],
 *   channelPolicies: {
 *     "777888999000111222": { allow: true, requireMention: false },
 *   },
 * };
 * ```
 */
export interface DiscordBotConfig {
  /**
   * Discord bot token. Never commit this — use environment variables or the
   * secrets file at `~/.lobs/config/secrets/discord-token.json`.
   */
  botToken: string;

  /**
   * Primary guild/server ID. Used to resolve named channels and populate
   * agent context. Falls back to `DISCORD_GUILD_ID`.
   */
  guildId?: string;

  /**
   * Named channel IDs for proactive messages sent by the bot.
   * Channels passed to `service.send()` / `service.sendEmbed()` directly.
   */
  channels?: {
    /** Fall back here when a destination isn't an explicit snowflake. */
    alerts?: string;
    /** General notification channel. */
    notifications?: string;
  };

  /**
   * Owner's Discord user ID. Intended for future use in routing system
   * events to a specific person via DM.
   */
  ownerId?: string;

  /**
   * User snowflake IDs allowed to DM the bot. Messages from anyone not in
   * this list are dropped silently. An empty array disables DMs entirely.
   */
  dmAllowFrom?: string[];

  /**
   * Bot user IDs whose messages are accepted. By default all bot messages are
   * ignored to prevent loops. Add a bot's ID here to let it trigger the agent.
   */
  botAllowFrom?: string[];

  /**
   * Per-channel policies keyed by channel snowflake ID.
   *
   * These take precedence over `guildPolicies`. A channel with no entry here
   * falls back to the guild-level policy (if any); messages from channels with
   * no matching policy at either level are dropped silently.
   *
   * @example
   * ```json
   * {
   *   "777888999000111222": { "allow": true, "requireMention": false },
   *   "333444555666777888": { "allow": true, "requireMention": true }
   * }
   * ```
   */
  channelPolicies?: Record<string, ChannelPolicy>;

  /**
   * Per-guild default policies. Applied to all channels in the guild unless
   * a more specific `channelPolicies` entry exists for the channel.
   *
   * Useful for allowing an entire server while requiring mention in most
   * channels, then overriding `requireMention: false` for specific channels.
   */
  guildPolicies?: Record<string, ChannelPolicy>;

  /**
   * Plain-text agent names recognized as @mentions (case-insensitive).
   * A message containing any of these names is treated as if the bot was
   * directly @mentioned — useful when `requireMention` is true.
   *
   * @example `["lobs", "lobot", "assistant"]`
   */
  agentNames?: string[];

  /**
   * How long (ms) an idle channel session is kept before being evicted.
   * Default: 3 600 000 (1 hour).
   *
   * Sessions are flushed to the `sessionStore` before eviction when one
   * is configured.
   */
  sessionTtlMs?: number;
}

// ── Inbound message ───────────────────────────────────────────────────────────

/**
 * A Discord message that has passed all policy filters and is ready to be
 * sent to the agent. Passed to `agentFactory` and the `onComplete`/`onError`
 * callbacks.
 */
export interface InboundMessage {
  /** Discord message snowflake ID. */
  messageId: string;
  /** Processed text content — includes embed text and inlined text attachments. */
  content: string;
  /** Discord channel (or thread) snowflake ID. */
  channelId: string;
  /** Author's Discord user ID. */
  authorId: string;
  /** Author's `username#discriminator` tag. */
  authorTag: string;
  /** Guild nickname if available, otherwise display name or username. */
  displayName: string;
  /** True when the message was sent as a DM. */
  isDm: boolean;
  /** True when the bot was @mentioned or its name appeared in the message. */
  isMentioned: boolean;
  /** Guild snowflake ID — undefined for DMs. */
  guildId?: string;
  /**
   * Image attachments encoded as base64 for vision-capable models.
   * Populated from PNG/JPEG/GIF/WebP attachments (up to 20 MB each).
   */
  images?: Array<{ data: string; mediaType: string; filename?: string }>;
}

// ── Send embed ────────────────────────────────────────────────────────────────

/** Parameters for `DiscordService.sendEmbed()`. All fields are optional. */
export interface DiscordEmbed {
  title?: string;
  description?: string;
  /** Integer color (e.g. `0x00ff00` for green, `0xff0000` for red). */
  color?: number;
  fields?: EmbedField[];
  footer?: string;
  /** URL the embed title links to. */
  url?: string;
  /** Author name shown above the title. */
  author?: string;
}

/** A single field in a Discord embed. */
export interface EmbedField {
  name: string;
  value: string;
  /** Display inline (side-by-side) with adjacent inline fields. */
  inline?: boolean;
}

// ── Fetched message ───────────────────────────────────────────────────────────

/** A message returned by `DiscordService.fetchMessages()` / `fetchMessage()`. */
export interface FetchedMessage {
  id: string;
  content: string;
  authorId: string;
  authorTag: string;
  displayName: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Number of file attachments. */
  attachments: number;
  /** Number of embeds. */
  embeds: number;
}
