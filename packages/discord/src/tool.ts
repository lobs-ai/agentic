/**
 * DiscordTool — gives agents the ability to interact with Discord.
 *
 * Inject a DiscordService at construction time, then register with:
 *   runtime.tool(new DiscordTool(service))
 */

import { BaseTool, type ToolContext } from "@agentic/tools";
import type { DiscordService } from "./service.js";

type Input = {
  action: string;
  channel_id?: string;
  guild_id?: string;
  message_id?: string;
  content?: string;
  emoji?: string;
  name?: string;
  limit?: number;
  before?: string;
  auto_archive_duration?: 60 | 1440 | 4320 | 10080;
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: string;
  url?: string;
  author?: string;
  user_id?: string;
};

export class DiscordTool extends BaseTool<Input> {
  readonly name = "discord";
  readonly tags = ["discord"] as const;

  readonly description = `Interact with Discord. Supports:
- send: send a message to a channel
- reply: reply to a specific message
- react / remove_reaction: add or remove emoji reactions
- fetch_messages: get recent messages from a channel
- fetch_message: get a single message by ID
- create_thread: start a thread on a message
- send_embed: send a rich embed message
- list_channels: list channels in a guild
- get_guild: get guild info
- get_member: get a guild member's info
- list_roles: list roles in a guild`;

  readonly inputSchema = {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        enum: [
          "send",
          "reply",
          "react",
          "remove_reaction",
          "fetch_messages",
          "fetch_message",
          "create_thread",
          "send_embed",
          "list_channels",
          "get_guild",
          "get_member",
          "list_roles",
        ],
        description: "Action to perform",
      },
      channel_id: { type: "string", description: "Discord channel or thread ID (snowflake)" },
      guild_id: { type: "string", description: "Discord guild/server ID" },
      message_id: { type: "string", description: "Discord message ID" },
      content: { type: "string", description: "Message text (for send, reply)" },
      emoji: { type: "string", description: "Emoji for react/remove_reaction — unicode like 👍 or custom name:id" },
      name: { type: "string", description: "Thread name (for create_thread)" },
      limit: { type: "number", description: "Max messages to fetch (default 20, max 100)" },
      before: { type: "string", description: "Fetch messages before this message ID" },
      auto_archive_duration: {
        type: "number",
        enum: [60, 1440, 4320, 10080],
        description: "Thread auto-archive in minutes (for create_thread)",
      },
      title: { type: "string", description: "Embed title (for send_embed)" },
      description: { type: "string", description: "Embed description (for send_embed)" },
      color: { type: "number", description: "Embed color as integer (for send_embed)" },
      fields: {
        type: "array",
        description: "Embed fields (for send_embed)",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            value: { type: "string" },
            inline: { type: "boolean" },
          },
          required: ["name", "value"],
        },
      },
      footer: { type: "string", description: "Embed footer text (for send_embed)" },
      url: { type: "string", description: "Embed URL (for send_embed)" },
      author: { type: "string", description: "Embed author name (for send_embed)" },
      user_id: { type: "string", description: "User ID (for get_member)" },
    },
    required: ["action"],
  };

  constructor(private readonly service: DiscordService) {
    super();
  }

  async run(input: Input, _ctx: ToolContext): Promise<string> {
    const svc = this.service;
    const { action } = input;

    try {
      switch (action) {
        case "send": {
          if (!input.channel_id) return err("channel_id is required");
          if (!input.content) return err("content is required");
          await svc.send(input.channel_id, input.content);
          return ok({ channelId: input.channel_id });
        }

        case "reply": {
          if (!input.channel_id) return err("channel_id is required");
          if (!input.message_id) return err("message_id is required");
          if (!input.content) return err("content is required");
          await svc.reply(input.channel_id, input.message_id, input.content);
          return ok({ channelId: input.channel_id, messageId: input.message_id });
        }

        case "react": {
          if (!input.channel_id) return err("channel_id is required");
          if (!input.message_id) return err("message_id is required");
          if (!input.emoji) return err("emoji is required");
          await svc.react(input.channel_id, input.message_id, input.emoji);
          return ok({ ok: true });
        }

        case "remove_reaction": {
          if (!input.channel_id) return err("channel_id is required");
          if (!input.message_id) return err("message_id is required");
          if (!input.emoji) return err("emoji is required");
          await svc.removeReaction(input.channel_id, input.message_id, input.emoji);
          return ok({ ok: true });
        }

        case "fetch_messages": {
          if (!input.channel_id) return err("channel_id is required");
          const msgs = await svc.fetchMessages(input.channel_id, input.limit, input.before);
          return ok(msgs);
        }

        case "fetch_message": {
          if (!input.channel_id) return err("channel_id is required");
          if (!input.message_id) return err("message_id is required");
          const msg = await svc.fetchMessage(input.channel_id, input.message_id);
          if (!msg) return err(`Message ${input.message_id} not found`);
          return ok(msg);
        }

        case "create_thread": {
          if (!input.channel_id) return err("channel_id is required");
          if (!input.message_id) return err("message_id is required");
          if (!input.name) return err("name is required");
          const threadId = await svc.createThread(
            input.channel_id,
            input.message_id,
            input.name,
            input.auto_archive_duration,
          );
          if (!threadId) return err("Failed to create thread");
          return ok({ threadId });
        }

        case "send_embed": {
          if (!input.channel_id) return err("channel_id is required");
          await svc.sendEmbed(input.channel_id, {
            title: input.title,
            description: input.description,
            color: input.color,
            fields: input.fields,
            footer: input.footer,
            url: input.url,
            author: input.author,
          });
          return ok({ channelId: input.channel_id });
        }

        case "list_channels": {
          if (!input.guild_id) return err("guild_id is required");
          const channels = await svc.listChannels(input.guild_id);
          return ok(channels);
        }

        case "get_guild": {
          if (!input.guild_id) return err("guild_id is required");
          const guild = await svc.getGuild(input.guild_id);
          if (!guild) return err(`Guild ${input.guild_id} not found`);
          return ok(guild);
        }

        case "get_member": {
          if (!input.guild_id) return err("guild_id is required");
          if (!input.user_id) return err("user_id is required");
          const member = await svc.getMember(input.guild_id, input.user_id);
          if (!member) return err(`Member ${input.user_id} not found`);
          return ok(member);
        }

        case "list_roles": {
          if (!input.guild_id) return err("guild_id is required");
          const roles = await svc.listRoles(input.guild_id);
          return ok(roles);
        }

        default:
          return err(`Unknown action: ${action}`);
      }
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }
}

/** Convenience factory — useful when registering the tool manually. */
export function createDiscordTool(service: DiscordService): DiscordTool {
  return new DiscordTool(service);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data: unknown): string {
  return JSON.stringify({ ok: true, ...((typeof data === "object" && data !== null) ? data : { result: data }) });
}

function err(message: string): string {
  return JSON.stringify({ ok: false, error: message });
}
