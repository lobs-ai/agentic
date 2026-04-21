# @agentic/discord

Discord bot integration for AgenticRuntime — connect discord.js to an agentic agent with per-channel conversation sessions, image support, and a Discord tool agents can use to interact with the server.

---

## Install

```bash
npm install @agentic/discord discord.js
```

Requires Node.js ≥ 18.

---

## Overview

`@agentic/discord` sits between discord.js and `AgenticRuntime`. It handles:

- **Connection management** — login, automatic reconnection, health monitoring
- **Message routing** — channel/guild/DM policies, mention filtering, per-channel message serialization
- **Attachment handling** — text files inlined as code blocks, images as base64 for vision models
- **Session management** — per-channel `Session` with TTL eviction and optional persistence
- **Agent integration** — two modes: simple runtime-based, or plug in your own pre-configured agent
- **Discord tool** — gives agents the ability to send messages, react, create threads, fetch history, and more

---

## Quick start

```typescript
import { AgenticRuntime } from "agentic";
import { DiscordBot, loadDiscordConfig } from "@agentic/discord";

const config = loadDiscordConfig(); // reads ~/.lobs/config/discord.json
if (!config) process.exit(0);      // no token found — bot disabled

const runtime = await AgenticRuntime.fromConfig(); // reads agentic.yaml
const bot = new DiscordBot({
  runtime,
  config,
  systemPrompt: "You are a helpful assistant. Keep responses under 2000 characters.",
});

await bot.start();
```

After `start()`, the bot listens for messages according to your channel policies, runs an agent for each one, and replies with the agent's output. Agents have access to all tools registered in the runtime plus a `discord` tool for interacting with the server.

---

## Integration modes

### Mode 1: runtime-based (simple)

Pass a runtime and the bot creates agents from it for each message. This is the default path.

```typescript
const bot = new DiscordBot({
  runtime,
  config,
  model: "claude-sonnet-4-6",   // override the runtime default
  timeout: 120,                  // seconds per agent run
  tools: ["read", "grep"],       // restrict which tools are available
  systemPrompt: "You are a code review assistant.",
});
```

The bot automatically registers a `discord` tool into the runtime's shared tool registry on `start()`, so agents can interact with Discord from within their runs.

### Mode 2: agentFactory (existing system)

If you already have a configured agent setup, pass an `agentFactory` instead of relying on the bot's built-in agent creation. The factory receives the inbound Discord message and returns an `Agent`. The bot calls `.withSession(session).run(message)` on it.

```typescript
import { DiscordBot, type InboundMessage } from "@agentic/discord";

// Your existing agent setup — untouched:
const chatAgent = runtime.defineAgent({
  name: "chat",
  model: "claude-sonnet-4-6",
  systemPrompt: "You are a study assistant. Keep answers concise.",
  tools: ["read", "grep"],
});

// Discord layer on top:
const bot = new DiscordBot({
  config,
  agentFactory: () => chatAgent(),
});

await bot.start();
```

`agentFactory` has full access to the inbound message, so you can route to different agents by channel, DM vs. guild, mention, or any other property:

```typescript
const bot = new DiscordBot({
  config,
  agentFactory: (msg: InboundMessage) => {
    if (msg.isDm) return supportAgent();
    if (msg.channelId === CODING_CHANNEL) return codeAgent();
    return generalAgent();
  },
});
```

When `agentFactory` is provided:
- `model`, `timeout`, `tools`, and `systemPrompt` options are ignored — configure them on the agent instead
- `registerDiscordTool` defaults to `false` — you control what tools are available

---

## Configuration

### Discord config file

`loadDiscordConfig()` reads from `~/.lobs/config/discord.json`. Token resolution order:

1. `~/.lobs/config/secrets/discord-token.json` → `{ "botToken": "..." }` (preferred)
2. `discord.json` → `botToken` field (deprecated, logs a warning)
3. `DISCORD_BOT_TOKEN` environment variable

```json
// ~/.lobs/config/discord.json
{
  "guildId": "123456789012345678",
  "channels": {
    "alerts": "987654321098765432"
  },
  "ownerId": "111111111111111111",
  "dmAllowFrom": ["222222222222222222"],
  "botAllowFrom": [],
  "agentNames": ["lobs", "lobot"],
  "channelPolicies": {
    "333333333333333333": { "allow": true, "requireMention": false },
    "444444444444444444": { "allow": true, "requireMention": true }
  },
  "guildPolicies": {
    "123456789012345678": { "allow": true, "requireMention": true }
  }
}
```

Set `"enabled": false` to disable the bot without removing the config.

### Inline config

Skip the config file and construct the config directly:

```typescript
import type { DiscordBotConfig } from "@agentic/discord";

const config: DiscordBotConfig = {
  botToken: process.env.DISCORD_BOT_TOKEN!,
  guildId: process.env.DISCORD_GUILD_ID,
  dmAllowFrom: ["222222222222222222"],
  channelPolicies: {
    "333333333333333333": { allow: true, requireMention: false },
  },
};
```

### DiscordBotConfig reference

| Field | Type | Description |
|-------|------|-------------|
| `botToken` | `string` | Discord bot token (required) |
| `guildId` | `string?` | Primary guild/server ID |
| `channels.alerts` | `string?` | Channel ID for proactive alert messages |
| `channels.notifications` | `string?` | Channel ID for notification messages |
| `ownerId` | `string?` | Owner user ID for system DMs |
| `dmAllowFrom` | `string[]` | User IDs allowed to DM the bot (others dropped silently) |
| `botAllowFrom` | `string[]` | Bot user IDs whose messages are accepted |
| `channelPolicies` | `Record<id, ChannelPolicy>` | Per-channel allow/mention rules; takes precedence over `guildPolicies` |
| `guildPolicies` | `Record<id, ChannelPolicy>` | Per-guild default policy (applies to all channels unless overridden) |
| `agentNames` | `string[]` | Plain-text names that count as a bot mention (case-insensitive) |
| `sessionTtlMs` | `number?` | How long an idle session is kept before eviction. Default: 3 600 000 (1 hour) |

### ChannelPolicy

```typescript
interface ChannelPolicy {
  allow: boolean;          // true to process messages from this channel
  requireMention: boolean; // true to only respond when @mentioned (or name typed)
  dropBotMessages?: boolean; // silently drop messages from other bots
}
```

---

## DiscordBotOptions reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `config` | `DiscordBotConfig` | — | Discord connection config (required) |
| `runtime` | `AgenticRuntime?` | — | Runtime for creating agents; required unless `agentFactory` is provided |
| `agentFactory` | `(msg) => Agent` | — | Custom agent factory; takes precedence over runtime for message handling |
| `systemPrompt` | `string?` | Generic assistant prompt | System prompt for the runtime agent. Ignored when `agentFactory` is provided |
| `model` | `string?` | Runtime default | Model for the runtime agent. Ignored when `agentFactory` is provided |
| `timeout` | `number?` | `120` | Max seconds per agent run. Ignored when `agentFactory` is provided |
| `tools` | `string[]?` | All registered | Tool names for the runtime agent. Ignored when `agentFactory` is provided |
| `registerDiscordTool` | `boolean?` | `true` with runtime, `false` with factory | Whether to register `DiscordTool` into the runtime's shared registry on `start()` |
| `sessionStore` | `SessionStore?` | In-memory | Persistence backend for conversation history |
| `showTyping` | `boolean?` | `true` | Show typing indicator while the agent runs |
| `onComplete` | `function?` | — | Called after each successful run |
| `onError` | `function?` | — | Called on agent errors; return a string to override the default error reply |

---

## Sessions

Each Discord channel gets its own `Session` that accumulates the full conversation history. Messages in the same channel are processed one at a time (queued) so concurrent messages never interleave.

Sessions are kept in memory by default and evicted after the configured TTL (default 1 hour of inactivity). Clear a session manually — for example when a user types `/clear`:

```typescript
await bot.clearSession(channelId);
```

### Persistent sessions

Implement `SessionStore` and pass it via `sessionStore` to persist conversation history across bot restarts:

```typescript
import type { SessionStore } from "@agentic/runner";
import type { LLMMessage } from "@agentic/llm";

class RedisSessionStore implements SessionStore {
  async load(sessionId: string): Promise<LLMMessage[]> {
    const raw = await redis.get(sessionId);
    return raw ? JSON.parse(raw) : [];
  }
  async save(sessionId: string, messages: readonly LLMMessage[]): Promise<void> {
    await redis.set(sessionId, JSON.stringify(messages), "EX", 86400);
  }
}

const bot = new DiscordBot({
  runtime,
  config,
  sessionStore: new RedisSessionStore(),
});
```

Session IDs are namespaced as `discord:<channelId>`.

---

## The Discord tool

When `registerDiscordTool` is true (the default with a runtime), agents can call the `discord` tool to interact with the server during their runs:

| Action | Required params | Description |
|--------|----------------|-------------|
| `send` | `channel_id`, `content` | Send a message to a channel |
| `reply` | `channel_id`, `message_id`, `content` | Reply to a specific message |
| `react` | `channel_id`, `message_id`, `emoji` | Add a reaction |
| `remove_reaction` | `channel_id`, `message_id`, `emoji` | Remove a reaction |
| `fetch_messages` | `channel_id` | Get recent messages (`limit`, `before` optional) |
| `fetch_message` | `channel_id`, `message_id` | Get a single message |
| `create_thread` | `channel_id`, `message_id`, `name` | Start a thread on a message |
| `send_embed` | `channel_id` | Send a rich embed (`title`, `description`, `color`, `fields`, `footer`) |
| `list_channels` | `guild_id` | List channels in a guild |
| `get_guild` | `guild_id` | Get guild info (name, memberCount, ownerId) |
| `get_member` | `guild_id`, `user_id` | Get a member's display name and roles |
| `list_roles` | `guild_id` | List roles in a guild |

### Manual tool registration

To register the Discord tool yourself (e.g. into a scoped registry, or after `start()`):

```typescript
import { createDiscordTool } from "@agentic/discord";

const bot = new DiscordBot({ config, runtime, registerDiscordTool: false });
await bot.start();

// Register into a custom scoped registry instead of the shared one
myRegistry.register(createDiscordTool(bot.service));
```

---

## Proactive sends

`bot.service` exposes the `DiscordService` for sending messages outside of the agent loop — startup notifications, cron alerts, external event triggers, etc.:

```typescript
await bot.start();

// Plain text
await bot.service.send(config.channels!.alerts!, "Bot started successfully.");

// Rich embed
await bot.service.sendEmbed(config.channels!.alerts!, {
  title: "Deployment complete",
  description: "Version 1.2.3 is live.",
  color: 0x00ff00,
  fields: [
    { name: "Environment", value: "production" },
    { name: "Duration", value: "4m 12s" },
  ],
});

// Reply to a specific message
await bot.service.reply(channelId, messageId, "Done!");

// React to a message
await bot.service.react(channelId, messageId, "✅");

// Show typing indicator (fire and forget)
bot.service.sendTyping(channelId);
```

---

## Attachments and images

Attachments are processed automatically before the agent sees the message:

- **Text files** (`.ts`, `.py`, `.md`, `.json`, etc.) — downloaded and inlined as fenced code blocks. Files over 512 KB are skipped with a notice.
- **Images** (PNG, JPEG, GIF, WebP) — fetched and passed as base64 image blocks so vision-capable models (Claude, GPT-4o) can see them. Images over 20 MB are skipped.
- **Other files** — ignored.

---

## Callbacks

```typescript
const bot = new DiscordBot({
  runtime,
  config,
  onComplete(channelId, msg, result) {
    console.log(
      `[${channelId}] ${msg.displayName}: ${result.turns} turns, ` +
      `$${result.costUsd.toFixed(4)}`
    );
  },
  onError(channelId, msg, err) {
    console.error(`[${channelId}] Error for ${msg.displayName}:`, err);
    // Return a custom error message to send to Discord, or void for the default
    return "Something went wrong. Please try again.";
  },
});
```

---

## DiscordService API

`bot.service` exposes all Discord operations:

```typescript
// Send (auto-splits at 2000 chars)
await service.send(channelId, content)

// Reply to a specific message
await service.reply(channelId, messageId, content)

// Rich embed
await service.sendEmbed(channelId, embed)

// Reactions
await service.react(channelId, messageId, emoji)
await service.removeReaction(channelId, messageId, emoji)

// Fetch messages (returns FetchedMessage[])
await service.fetchMessages(channelId, limit?, before?)
await service.fetchMessage(channelId, messageId)

// Threads
await service.createThread(channelId, messageId, name, autoArchiveDuration?)

// Typing indicator (fire and forget)
service.sendTyping(channelId)

// Guild info
await service.listChannels(guildId)
await service.getGuild(guildId)
await service.getMember(guildId, userId)
await service.listRoles(guildId)

// State
service.isReady     // boolean
service.botUserId   // string | undefined
```

---

## Environment variables

All fields in `DiscordBotConfig` can come from environment variables when using `loadDiscordConfig()`:

| Variable | Config field |
|----------|-------------|
| `DISCORD_BOT_TOKEN` | `botToken` |
| `DISCORD_GUILD_ID` | `guildId` |
| `DISCORD_CHANNEL_ALERTS` | `channels.alerts` |
| `DISCORD_CHANNEL_NOTIFICATIONS` | `channels.notifications` |
| `DISCORD_OWNER_ID` | `ownerId` |

---

## Requirements

- Node.js ≥ 18
- `discord.js` ^14 (peer dependency)
- `ANTHROPIC_API_KEY` (or other provider key) for the agentic runtime

---

## License

MIT
