/**
 * Agent identity configuration — who the bot is and who it serves.
 *
 * Loads from {configDir}/identity.json.
 * Falls back to generic defaults when no file is present.
 */
import type { IdentityConfig, BotIdentity, OwnerIdentity } from "./types.js";
export type { IdentityConfig, BotIdentity, OwnerIdentity };
/** Generic fallback identity used when no identity.json exists. */
export declare const DEFAULT_IDENTITY: IdentityConfig;
/**
 * Load identity config from {configDir}/identity.json.
 * Results are cached; call resetIdentityCache() to reload.
 *
 * @param configDir - Override the config directory (default: getConfigDir())
 */
export declare function loadIdentityConfig(configDir?: string): IdentityConfig;
/**
 * Build an IdentityConfig directly from a plain object.
 * Fills in any missing fields with DEFAULT_IDENTITY values.
 */
export declare function buildIdentityConfig(partial: Partial<IdentityConfig>): IdentityConfig;
/** Reset the cached identity config (for testing or config reload). */
export declare function resetIdentityCache(): void;
/** Bot display name (e.g. "Lobs", "MyBot"). */
export declare function getBotName(configDir?: string): string;
/** Bot lowercase identifier (e.g. "lobs", "mybot"). */
export declare function getBotId(configDir?: string): string;
/** Owner display name (e.g. "Rafe", "Marcus"). */
export declare function getOwnerName(configDir?: string): string;
/** Owner lowercase identifier. */
export declare function getOwnerId(configDir?: string): string;
/** Owner's Discord user ID, if configured. */
export declare function getOwnerDiscordId(configDir?: string): string | undefined;
/** Full identity config object. */
export declare function getIdentity(configDir?: string): IdentityConfig;
/**
 * Get the bot's mention names (lowercased name + id).
 * Useful for detecting when the bot is mentioned in messages.
 *
 * Also checks AGENT_NAME env var as a fallback (useful in containers).
 */
export declare function getBotMentionNames(configDir?: string): string[];
//# sourceMappingURL=identity.d.ts.map