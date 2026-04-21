/**
 * Config loading for @agentic/discord.
 *
 * Token resolution order:
 *   1. ~/.lobs/config/secrets/discord-token.json (botToken field)
 *   2. config.botToken (legacy — warns if used)
 *   3. DISCORD_BOT_TOKEN env var
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { DiscordBotConfig } from "./types.js";

const LOBS_ROOT = join(homedir(), ".lobs");

/**
 * Load DiscordBotConfig from the standard lobs config directory.
 *
 * Returns null when the bot is disabled or no token is found.
 * Falls back to environment variables for each field.
 */
export function loadDiscordConfig(): DiscordBotConfig | null {
  const configDir = join(LOBS_ROOT, "config");
  const configPath = join(configDir, "discord.json");
  const tokenPath = join(configDir, "secrets", "discord-token.json");

  let raw: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      raw = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      if (raw.enabled === false) {
        console.log("[discord] Bot disabled in config");
        return null;
      }
    } catch (err) {
      console.error("[discord] Failed to parse discord.json:", err);
    }
  }

  let botToken: string | undefined;

  if (existsSync(tokenPath)) {
    try {
      const t = JSON.parse(readFileSync(tokenPath, "utf-8")) as Record<string, unknown>;
      if (typeof t.botToken === "string") botToken = t.botToken;
    } catch (err) {
      console.error("[discord] Failed to parse secrets/discord-token.json:", err);
    }
  }

  if (!botToken && typeof raw.botToken === "string") {
    console.warn("[discord] DEPRECATED: botToken in discord.json — move to secrets/discord-token.json");
    botToken = raw.botToken;
  }

  if (!botToken) botToken = process.env.DISCORD_BOT_TOKEN;

  if (!botToken) {
    console.log("[discord] No botToken found — Discord bot disabled");
    return null;
  }

  return {
    botToken,
    guildId: (raw.guildId as string | undefined) ?? process.env.DISCORD_GUILD_ID,
    channels: (raw.channels as DiscordBotConfig["channels"] | undefined) ?? {
      alerts: process.env.DISCORD_CHANNEL_ALERTS,
      notifications: process.env.DISCORD_CHANNEL_NOTIFICATIONS,
    },
    ownerId: (raw.ownerId as string | undefined) ?? process.env.DISCORD_OWNER_ID,
    dmAllowFrom: (raw.dmAllowFrom as string[] | undefined) ?? [],
    botAllowFrom: (raw.botAllowFrom as string[] | undefined) ?? [],
    channelPolicies: (raw.channelPolicies as DiscordBotConfig["channelPolicies"]) ?? {},
    guildPolicies: (raw.guildPolicies as DiscordBotConfig["guildPolicies"]) ?? {},
    agentNames: (raw.agentNames as string[] | undefined) ?? [],
  };
}
