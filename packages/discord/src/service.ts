/**
 * DiscordService — manages the discord.js connection lifecycle.
 *
 * Responsibilities:
 * - Connect / disconnect with automatic reconnection + exponential backoff
 * - Send messages (with auto-split for the 2000-char limit and retry)
 * - Expose helpers for reactions, threads, embeds, and message fetching
 * - Periodic health checks to detect zombie connections
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  TextChannel,
  type Collection,
  type Attachment,
  type Embed,
} from "discord.js";
import type { DiscordBotConfig, InboundMessage, DiscordEmbed, FetchedMessage } from "./types.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const DISCORD_MAX_MSG = 2000;
const HEALTH_CHECK_MS = 30_000;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
const SEND_RETRY_ATTEMPTS = 2;
const SEND_RETRY_DELAY_MS = 1_000;
const SEND_TIMEOUT_MS = 15_000;

// ── Text extensions recognized as readable files ──────────────────────────────

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".yaml", ".yml", ".toml", ".xml", ".csv", ".tsv",
  ".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".rs", ".go", ".java", ".c",
  ".cpp", ".h", ".hpp", ".cs", ".swift", ".kt", ".scala", ".sh", ".bash",
  ".zsh", ".fish", ".ps1", ".html", ".css", ".scss", ".less", ".sass",
  ".sql", ".graphql", ".gql", ".env", ".ini", ".cfg", ".conf", ".properties",
  ".dockerfile", ".makefile", ".cmake", ".r", ".m", ".lua", ".pl", ".pm",
  ".php", ".log", ".diff", ".patch", ".tex", ".bib", ".rst", ".adoc", ".org",
  ".gitignore", ".gitattributes", ".editorconfig", ".eslintrc", ".prettierrc",
  ".babelrc", ".svelte", ".vue", ".astro",
]);

const TEXT_MIME_PREFIXES = [
  "text/", "application/json", "application/xml", "application/yaml",
  "application/toml", "application/javascript", "application/typescript",
];

const IMAGE_MIME_MAP: Record<string, string> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

const IMAGE_EXT_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type ConnectionState = "disconnected" | "connecting" | "ready" | "reconnecting";

type MessageHandler = (msg: InboundMessage) => void;

// ── DiscordService ────────────────────────────────────────────────────────────

export class DiscordService {
  private client: Client | null = null;
  private config: DiscordBotConfig | null = null;
  private state: ConnectionState = "disconnected";
  private messageHandler: MessageHandler | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private shuttingDown = false;

  // ── Connect / disconnect ────────────────────────────────────────────────────

  async connect(config: DiscordBotConfig): Promise<void> {
    if (this.state === "ready") return;
    this.config = config;
    this.state = "connecting";
    this.shuttingDown = false;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
      ],
      partials: [Partials.Channel],
    });

    this.attachEventHandlers();

    await new Promise<void>((resolve, reject) => {
      this.client!.once("ready", () => {
        console.log(`[discord] Connected as ${this.client!.user?.tag}`);
        this.state = "ready";
        this.reconnectAttempts = 0;
        resolve();
      });
      this.client!.once("error", reject);
    });

    await this.client.login(config.botToken);
    this.startHealthCheck();
  }

  async disconnect(): Promise<void> {
    this.shuttingDown = true;
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = null;
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    this.state = "disconnected";
  }

  get isReady(): boolean {
    return this.state === "ready";
  }

  get botUserId(): string | undefined {
    return this.client?.user?.id;
  }

  // ── Message listener ────────────────────────────────────────────────────────

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
    this.setupMessageListener();
  }

  private setupMessageListener(): void {
    if (!this.client || !this.config) return;

    this.client.on("messageCreate", async (msg) => {
      if (!this.config || !this.messageHandler) return;

      // Ignore own messages
      if (msg.author.id === this.client!.user!.id) return;

      // Drop bots unless explicitly allowed
      if (
        msg.author.bot &&
        !(this.config.botAllowFrom ?? []).includes(msg.author.id) &&
        !msg.mentions.has(this.client!.user!)
      ) return;

      const isDm = !msg.guildId;

      if (isDm) {
        const allowed = this.config.dmAllowFrom ?? [];
        if (!allowed.includes(msg.author.id)) {
          console.debug(`[discord] Dropping DM from ${msg.author.tag} — not in dmAllowFrom`);
          return;
        }
      } else {
        // Guild channel — apply channel or guild policy
        const policy =
          (this.config.channelPolicies ?? {})[msg.channelId] ??
          (msg.guildId ? (this.config.guildPolicies ?? {})[msg.guildId] : undefined);

        if (!policy?.allow) {
          console.debug(`[discord] Dropping message from unlisted channel ${msg.channelId}`);
          return;
        }

        const isMentioned =
          msg.mentions.has(this.client!.user!) ||
          (this.config.agentNames ?? []).some((n) =>
            msg.content.toLowerCase().includes(n.toLowerCase()),
          );

        if (policy.requireMention && !isMentioned) {
          console.debug(`[discord] Dropping message — requireMention not satisfied`);
          return;
        }
      }

      const isMentioned =
        msg.mentions.has(this.client!.user!) ||
        (this.config.agentNames ?? []).some((n) =>
          msg.content.toLowerCase().includes(n.toLowerCase()),
        );

      // Build content (text + embeds + text attachments)
      let content = msg.content;

      if (msg.embeds.length > 0) {
        const embedText = this.embedsToText(msg.embeds);
        if (embedText) content = content ? `${content}\n\n${embedText}` : embedText;
      }

      let images: InboundMessage["images"];
      if (msg.attachments.size > 0) {
        const textChunk = await this.fetchTextAttachments(msg.attachments);
        if (textChunk) content = content ? `${content}\n\n${textChunk}` : textChunk;
        images = await this.fetchImageAttachments(msg.attachments);
      }

      const displayName =
        msg.member?.displayName || msg.author.displayName || msg.author.username;

      console.info(
        `[discord] Message channel=${msg.channelId} dm=${isDm} mentioned=${isMentioned} ` +
        `author=${displayName} len=${content.length}`,
      );

      this.messageHandler({
        messageId: msg.id,
        content,
        channelId: msg.channelId,
        authorId: msg.author.id,
        authorTag: msg.author.tag,
        displayName,
        isDm,
        isMentioned,
        guildId: msg.guildId ?? undefined,
        images: images?.length ? images : undefined,
      });
    });
  }

  // ── Send ────────────────────────────────────────────────────────────────────

  /** Send a message, splitting automatically at the Discord 2000-char limit. */
  async send(channelId: string, content: string): Promise<void> {
    if (!this.isReady || !this.client) return;
    if (!/^\d+$/.test(channelId)) {
      console.warn(`[discord] send() called with non-snowflake channelId: ${channelId}`);
      return;
    }
    const chunks = splitMessage(content);
    for (const chunk of chunks) {
      await this.sendWithRetry(channelId, chunk);
    }
  }

  /** Show typing indicator (fires and forgets). */
  sendTyping(channelId: string): void {
    if (!this.isReady || !this.client || !/^\d+$/.test(channelId)) return;
    this.client.channels.fetch(channelId).then((ch) => {
      if (ch?.isTextBased()) (ch as TextChannel).sendTyping().catch(() => {});
    }).catch(() => {});
  }

  /** Reply to a specific message. Falls back to send() on error. */
  async reply(channelId: string, messageId: string, content: string): Promise<void> {
    if (!this.isReady || !this.client) return;
    try {
      const ch = await this.client.channels.fetch(channelId);
      if (ch?.isTextBased()) {
        const target = await (ch as TextChannel).messages.fetch(messageId);
        const chunks = splitMessage(content);
        await target.reply(chunks[0]);
        for (const chunk of chunks.slice(1)) {
          await this.send(channelId, chunk);
        }
        return;
      }
    } catch {
      // fall through to regular send
    }
    await this.send(channelId, content);
  }

  /** Send a rich embed. */
  async sendEmbed(channelId: string, embed: DiscordEmbed): Promise<void> {
    if (!this.isReady || !this.client || !/^\d+$/.test(channelId)) return;
    const builder = new EmbedBuilder();
    if (embed.color !== undefined) builder.setColor(embed.color);
    if (embed.title) builder.setTitle(embed.title);
    if (embed.description) builder.setDescription(embed.description);
    if (embed.url) builder.setURL(embed.url);
    if (embed.author) builder.setAuthor({ name: embed.author });
    if (embed.footer) builder.setFooter({ text: embed.footer });
    if (embed.fields?.length) builder.addFields(embed.fields);
    try {
      const ch = await this.client.channels.fetch(channelId);
      if (ch?.isTextBased()) await (ch as TextChannel).send({ embeds: [builder] });
    } catch (err) {
      console.error(`[discord] sendEmbed failed channel=${channelId}:`, err);
    }
  }

  /** Add a reaction to a message. */
  async react(channelId: string, messageId: string, emoji: string): Promise<void> {
    if (!this.isReady || !this.client) return;
    try {
      const ch = await this.client.channels.fetch(channelId);
      if (ch?.isTextBased()) {
        const msg = await (ch as TextChannel).messages.fetch(messageId);
        await msg.react(emoji);
      }
    } catch (err) {
      console.error(`[discord] react failed:`, err);
    }
  }

  /** Remove a reaction from a message. */
  async removeReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
    if (!this.isReady || !this.client) return;
    try {
      const ch = await this.client.channels.fetch(channelId);
      if (ch?.isTextBased()) {
        const msg = await (ch as TextChannel).messages.fetch(messageId);
        const mine = msg.reactions.cache.filter((r) => r.me);
        for (const r of mine.values()) {
          if (r.emoji.name === emoji || r.emoji.toString() === emoji) {
            await r.users.remove(this.client.user!.id);
          }
        }
      }
    } catch (err) {
      console.error(`[discord] removeReaction failed:`, err);
    }
  }

  /** Fetch recent messages from a channel. */
  async fetchMessages(channelId: string, limit = 20, before?: string): Promise<FetchedMessage[]> {
    if (!this.isReady || !this.client) return [];
    try {
      const ch = await this.client.channels.fetch(channelId);
      if (!ch?.isTextBased()) return [];
      const opts: { limit: number; before?: string } = { limit: Math.min(limit, 100) };
      if (before) opts.before = before;
      const msgs = await (ch as TextChannel).messages.fetch(opts);
      return [...msgs.values()].map((m) => ({
        id: m.id,
        content: m.content,
        authorId: m.author.id,
        authorTag: m.author.tag,
        displayName: m.member?.displayName || m.author.displayName || m.author.username,
        timestamp: m.createdAt.toISOString(),
        attachments: m.attachments.size,
        embeds: m.embeds.length,
      }));
    } catch (err) {
      console.error(`[discord] fetchMessages failed:`, err);
      return [];
    }
  }

  /** Fetch a single message by ID. */
  async fetchMessage(channelId: string, messageId: string): Promise<FetchedMessage | null> {
    if (!this.isReady || !this.client) return null;
    try {
      const ch = await this.client.channels.fetch(channelId);
      if (!ch?.isTextBased()) return null;
      const m = await (ch as TextChannel).messages.fetch(messageId);
      return {
        id: m.id,
        content: m.content,
        authorId: m.author.id,
        authorTag: m.author.tag,
        displayName: m.member?.displayName || m.author.displayName || m.author.username,
        timestamp: m.createdAt.toISOString(),
        attachments: m.attachments.size,
        embeds: m.embeds.length,
      };
    } catch {
      return null;
    }
  }

  /** Create a thread on a message. */
  async createThread(
    channelId: string,
    messageId: string,
    name: string,
    autoArchiveDuration: 60 | 1440 | 4320 | 10080 = 1440,
  ): Promise<string | null> {
    if (!this.isReady || !this.client) return null;
    try {
      const ch = await this.client.channels.fetch(channelId);
      if (!ch?.isTextBased()) return null;
      const msg = await (ch as TextChannel).messages.fetch(messageId);
      const thread = await msg.startThread({ name, autoArchiveDuration });
      return thread.id;
    } catch (err) {
      console.error(`[discord] createThread failed:`, err);
      return null;
    }
  }

  /** List text channels in a guild. */
  async listChannels(guildId: string): Promise<Array<{ id: string; name: string; type: string }>> {
    if (!this.isReady || !this.client) return [];
    try {
      const guild = await this.client.guilds.fetch(guildId);
      const channels = await guild.channels.fetch();
      return [...channels.values()]
        .filter(Boolean)
        .map((ch) => ({ id: ch!.id, name: ch!.name, type: String(ch!.type) }));
    } catch {
      return [];
    }
  }

  /** Get basic guild info. */
  async getGuild(guildId: string): Promise<Record<string, unknown> | null> {
    if (!this.isReady || !this.client) return null;
    try {
      const guild = await this.client.guilds.fetch(guildId);
      return {
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
        createdAt: guild.createdAt.toISOString(),
      };
    } catch {
      return null;
    }
  }

  /** Get a guild member's info. */
  async getMember(guildId: string, userId: string): Promise<Record<string, unknown> | null> {
    if (!this.isReady || !this.client) return null;
    try {
      const guild = await this.client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      return {
        id: member.id,
        displayName: member.displayName,
        username: member.user.username,
        roles: [...member.roles.cache.values()].map((r) => ({ id: r.id, name: r.name })),
        joinedAt: member.joinedAt?.toISOString(),
      };
    } catch {
      return null;
    }
  }

  /** List roles in a guild. */
  async listRoles(guildId: string): Promise<Array<{ id: string; name: string }>> {
    if (!this.isReady || !this.client) return [];
    try {
      const guild = await this.client.guilds.fetch(guildId);
      const roles = await guild.roles.fetch();
      return [...roles.values()].map((r) => ({ id: r.id, name: r.name }));
    } catch {
      return [];
    }
  }

  // ── Private: send with retry ────────────────────────────────────────────────

  private async sendWithRetry(channelId: string, content: string): Promise<void> {
    for (let attempt = 1; attempt <= SEND_RETRY_ATTEMPTS; attempt++) {
      try {
        await Promise.race([
          this.sendOnce(channelId, content),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("send timeout")), SEND_TIMEOUT_MS),
          ),
        ]);
        return;
      } catch (err) {
        if (attempt === SEND_RETRY_ATTEMPTS) {
          console.error(`[discord] send failed after ${attempt} attempts:`, err);
        } else {
          await sleep(SEND_RETRY_DELAY_MS);
        }
      }
    }
  }

  private async sendOnce(channelId: string, content: string): Promise<void> {
    const ch = await this.client!.channels.fetch(channelId);
    if (!ch?.isTextBased()) throw new Error(`Channel ${channelId} is not text-based`);
    await (ch as TextChannel).send(content);
  }

  // ── Private: embed + attachment parsing ─────────────────────────────────────

  private embedsToText(embeds: Embed[]): string {
    return embeds
      .map((e) => {
        const lines: string[] = [];
        if (e.author?.name) lines.push(`Author: ${e.author.name}`);
        if (e.title) lines.push(`Title: ${e.title}`);
        if (e.url) lines.push(`URL: ${e.url}`);
        if (e.description) lines.push(e.description);
        for (const f of e.fields) {
          if (f.name && f.value) lines.push(`${f.name}: ${f.value}`);
        }
        if (e.footer?.text) lines.push(`Footer: ${e.footer.text}`);
        return lines.join("\n");
      })
      .filter(Boolean)
      .join("\n\n---\n\n");
  }

  private async fetchTextAttachments(
    attachments: Collection<string, Attachment>,
  ): Promise<string | null> {
    const MAX_SIZE = 512 * 1024;
    const parts: string[] = [];

    for (const [, att] of attachments) {
      const ext = att.name ? "." + att.name.split(".").pop()!.toLowerCase() : "";
      const byExt = TEXT_EXTENSIONS.has(ext) ||
        ["dockerfile", "makefile"].includes(att.name?.toLowerCase() ?? "");
      const byMime = att.contentType
        ? TEXT_MIME_PREFIXES.some((p) => att.contentType!.startsWith(p))
        : false;

      if (!byExt && !byMime) continue;
      if (att.size > MAX_SIZE) {
        parts.push(`[Attachment: ${att.name} — skipped, too large (${(att.size / 1024).toFixed(0)}KB)]`);
        continue;
      }
      try {
        const res = await fetch(att.url);
        if (!res.ok) { parts.push(`[Attachment: ${att.name} — download failed]`); continue; }
        const text = await res.text();
        parts.push(`--- File: ${att.name} ---\n${text}\n--- End: ${att.name} ---`);
      } catch (err) {
        parts.push(`[Attachment: ${att.name} — error: ${err instanceof Error ? err.message : "unknown"}]`);
      }
    }

    return parts.length ? parts.join("\n\n") : null;
  }

  private async fetchImageAttachments(
    attachments: Collection<string, Attachment>,
  ): Promise<Array<{ data: string; mediaType: string; filename?: string }>> {
    const MAX_SIZE = 20 * 1024 * 1024;
    const results: Array<{ data: string; mediaType: string; filename?: string }> = [];

    for (const [, att] of attachments) {
      const ct = att.contentType?.toLowerCase() ?? "";
      const ext = att.name ? "." + att.name.split(".").pop()!.toLowerCase() : "";
      const mediaType = IMAGE_MIME_MAP[ct] ?? IMAGE_EXT_MAP[ext];
      if (!mediaType || att.size > MAX_SIZE) continue;
      try {
        const res = await fetch(att.url);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        results.push({ data: buf.toString("base64"), mediaType, filename: att.name ?? undefined });
      } catch (err) {
        console.error(`[discord] Failed to fetch image ${att.name}:`, err);
      }
    }
    return results;
  }

  // ── Private: connection resilience ──────────────────────────────────────────

  private attachEventHandlers(): void {
    if (!this.client) return;

    this.client.on("shardDisconnect", () => {
      this.state = "reconnecting";
      console.warn("[discord] Disconnected — discord.js will reconnect automatically");
    });

    this.client.on("shardReconnecting", () => {
      this.state = "reconnecting";
    });

    this.client.on("shardReady", () => {
      console.log("[discord] Shard ready");
      this.state = "ready";
      this.reconnectAttempts = 0;
    });

    this.client.on("shardResume", () => {
      this.state = "ready";
      this.reconnectAttempts = 0;
    });

    this.client.on("invalidated", () => {
      if (this.shuttingDown) return;
      console.error("[discord] Session invalidated — reconnecting...");
      this.scheduleReconnect();
    });

    this.client.on("error", (err) => {
      console.error("[discord] Client error:", err.message);
    });
  }

  private startHealthCheck(): void {
    this.healthTimer = setInterval(() => {
      if (this.shuttingDown) return;
      if (this.state !== "ready") {
        console.warn(`[discord] Health check: state=${this.state}`);
      }
    }, HEALTH_CHECK_MS);
    this.healthTimer.unref?.();
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempts++;
    console.log(`[discord] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    setTimeout(async () => {
      if (this.shuttingDown || !this.config) return;
      try {
        this.state = "connecting";
        await this.client?.login(this.config.botToken);
      } catch (err) {
        console.error("[discord] Reconnect failed:", err);
        this.scheduleReconnect();
      }
    }, delay);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function splitMessage(content: string): string[] {
  if (content.length <= DISCORD_MAX_MSG) return [content];
  const chunks: string[] = [];
  let remaining = content;
  while (remaining.length > 0) {
    if (remaining.length <= DISCORD_MAX_MSG) {
      chunks.push(remaining);
      break;
    }
    // Try to split at a newline within the limit
    const slice = remaining.slice(0, DISCORD_MAX_MSG);
    const lastNewline = slice.lastIndexOf("\n");
    const cut = lastNewline > DISCORD_MAX_MSG / 2 ? lastNewline : DISCORD_MAX_MSG;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
