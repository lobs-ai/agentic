/**
 * Session management for Discord conversations.
 *
 * Maintains one Session per channel, with optional TTL-based eviction.
 * Users can provide a custom SessionStore for persistence across restarts.
 */

import { Session, type SessionStore } from "@agentic/runner";
import type { LLMMessage } from "@agentic/llm";

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

interface Entry {
  session: Session;
  lastUsed: number;
  cleanup?: ReturnType<typeof setTimeout>;
}

/**
 * Manages one `Session` per Discord channel, with TTL-based eviction and
 * optional persistence through a `SessionStore`.
 *
 * `DiscordBot` creates and owns one of these internally. You only need to
 * instantiate `DiscordSessionManager` directly when building a custom message
 * handler that bypasses `DiscordBot`.
 *
 * Session IDs are namespaced as `discord:<channelId>` when flushed to a store.
 *
 * @example Basic (in-memory, 30-minute TTL)
 * ```ts
 * const sessions = new DiscordSessionManager({ ttlMs: 30 * 60 * 1000 });
 * const session = await sessions.get(channelId);
 * ```
 *
 * @example Persistent (custom store)
 * ```ts
 * const sessions = new DiscordSessionManager({ store: new RedisSessionStore() });
 * const session = await sessions.get(channelId);
 * // ... run agent ...
 * await sessions.flush(); // persist all active sessions
 * ```
 */
export class DiscordSessionManager {
  private readonly sessions = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly store?: SessionStore;

  constructor(options: { ttlMs?: number; store?: SessionStore } = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.store = options.store;
  }

  /**
   * Get or create a Session for a Discord channel.
   * Resets the TTL timer on each access.
   */
  async get(channelId: string): Promise<Session> {
    const existing = this.sessions.get(channelId);
    if (existing) {
      this.resetTtl(channelId, existing);
      return existing.session;
    }

    let session: Session;
    if (this.store) {
      session = await Session.fromStore(`discord:${channelId}`, this.store);
    } else {
      session = new Session();
    }

    const entry: Entry = { session, lastUsed: Date.now() };
    this.resetTtl(channelId, entry);
    this.sessions.set(channelId, entry);
    return session;
  }

  /**
   * Remove a channel's session (e.g., on /clear command).
   * Also persists the cleared state if a store is configured.
   */
  async clear(channelId: string): Promise<void> {
    const entry = this.sessions.get(channelId);
    if (entry) {
      if (entry.cleanup) clearTimeout(entry.cleanup);
      this.sessions.delete(channelId);
      if (this.store) {
        await this.store.save(`discord:${channelId}`, []);
      }
    }
  }

  /** Flush all in-memory sessions to the store. */
  async flush(): Promise<void> {
    if (!this.store) return;
    const entries = [...this.sessions.entries()];
    await Promise.all(
      entries.map(([channelId, { session }]) =>
        this.store!.save(`discord:${channelId}`, session.messages as LLMMessage[]),
      ),
    );
  }

  private resetTtl(channelId: string, entry: Entry): void {
    entry.lastUsed = Date.now();
    if (entry.cleanup) clearTimeout(entry.cleanup);
    entry.cleanup = setTimeout(() => {
      this.evict(channelId);
    }, this.ttlMs);
    entry.cleanup.unref?.();
  }

  private evict(channelId: string): void {
    const entry = this.sessions.get(channelId);
    if (!entry) return;
    if (this.store) {
      // Best-effort persist before eviction
      this.store
        .save(`discord:${channelId}`, entry.session.messages as LLMMessage[])
        .catch((err) => console.error(`[discord] Failed to persist session ${channelId}:`, err));
    }
    this.sessions.delete(channelId);
    console.debug(`[discord] Session evicted for channel ${channelId}`);
  }
}
