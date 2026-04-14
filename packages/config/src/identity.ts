/**
 * Agent identity configuration — who the bot is and who it serves.
 *
 * Loads from {configDir}/identity.json.
 * Falls back to generic defaults when no file is present.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IdentityConfig, BotIdentity, OwnerIdentity } from "./types.js";
import { getConfigDir } from "./loader.js";

export type { IdentityConfig, BotIdentity, OwnerIdentity };

// ── Defaults ──────────────────────────────────────────────────────────────────

/** Generic fallback identity used when no identity.json exists. */
export const DEFAULT_IDENTITY: IdentityConfig = {
  bot: { name: "Agent", id: "agent" },
  owner: { name: "User", id: "user" },
};

// ── Loading ───────────────────────────────────────────────────────────────────

let _cached: IdentityConfig | null = null;

/**
 * Load identity config from {configDir}/identity.json.
 * Results are cached; call resetIdentityCache() to reload.
 *
 * @param configDir - Override the config directory (default: getConfigDir())
 */
export function loadIdentityConfig(configDir?: string): IdentityConfig {
  if (_cached) return _cached;

  const dir = configDir ?? getConfigDir();
  const configPath = resolve(dir, "identity.json");

  if (!existsSync(configPath)) {
    _cached = DEFAULT_IDENTITY;
    return _cached;
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    _cached = {
      bot: {
        name: raw?.bot?.name ?? DEFAULT_IDENTITY.bot.name,
        id:   raw?.bot?.id   ?? DEFAULT_IDENTITY.bot.id,
      },
      owner: {
        name:      raw?.owner?.name      ?? DEFAULT_IDENTITY.owner.name,
        id:        raw?.owner?.id        ?? DEFAULT_IDENTITY.owner.id,
        discordId: raw?.owner?.discordId ?? DEFAULT_IDENTITY.owner.discordId,
      },
    };
    return _cached;
  } catch (err) {
    console.warn(`[config/identity] Failed to load ${configPath}:`, err);
    _cached = DEFAULT_IDENTITY;
    return _cached;
  }
}

/**
 * Build an IdentityConfig directly from a plain object.
 * Fills in any missing fields with DEFAULT_IDENTITY values.
 */
export function buildIdentityConfig(partial: Partial<IdentityConfig>): IdentityConfig {
  return {
    bot: {
      name: partial.bot?.name ?? DEFAULT_IDENTITY.bot.name,
      id:   partial.bot?.id   ?? DEFAULT_IDENTITY.bot.id,
    },
    owner: {
      name:      partial.owner?.name      ?? DEFAULT_IDENTITY.owner.name,
      id:        partial.owner?.id        ?? DEFAULT_IDENTITY.owner.id,
      discordId: partial.owner?.discordId,
    },
  };
}

/** Reset the cached identity config (for testing or config reload). */
export function resetIdentityCache(): void {
  _cached = null;
}

// ── Accessors ─────────────────────────────────────────────────────────────────

/** Bot display name (e.g. "Lobs", "MyBot"). */
export function getBotName(configDir?: string): string {
  return loadIdentityConfig(configDir).bot.name;
}

/** Bot lowercase identifier (e.g. "lobs", "mybot"). */
export function getBotId(configDir?: string): string {
  return loadIdentityConfig(configDir).bot.id;
}

/** Owner display name (e.g. "Rafe", "Marcus"). */
export function getOwnerName(configDir?: string): string {
  return loadIdentityConfig(configDir).owner.name;
}

/** Owner lowercase identifier. */
export function getOwnerId(configDir?: string): string {
  return loadIdentityConfig(configDir).owner.id;
}

/** Owner's Discord user ID, if configured. */
export function getOwnerDiscordId(configDir?: string): string | undefined {
  return loadIdentityConfig(configDir).owner.discordId;
}

/** Full identity config object. */
export function getIdentity(configDir?: string): IdentityConfig {
  return loadIdentityConfig(configDir);
}

/**
 * Get the bot's mention names (lowercased name + id).
 * Useful for detecting when the bot is mentioned in messages.
 *
 * Also checks AGENT_NAME env var as a fallback (useful in containers).
 */
export function getBotMentionNames(configDir?: string): string[] {
  const identity = loadIdentityConfig(configDir);
  const names = new Set<string>();

  names.add(identity.bot.name.toLowerCase());
  names.add(identity.bot.id.toLowerCase());

  if (process.env.AGENT_NAME) {
    names.add(process.env.AGENT_NAME.toLowerCase());
  }

  return [...names];
}
