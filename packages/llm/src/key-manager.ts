/**
 * Key Manager
 *
 * Manages a pool of API keys per provider with:
 * - Round-robin selection with session stickiness
 * - Health tracking (auth failures, rate limits, unknown errors)
 * - Cooldown-based quarantine (rate-limited keys are temporarily excluded)
 * - In-flight request tracking (deprioritises keys with stuck requests)
 *
 * Keys are provided via config object — no file system reads here.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

type FailureType = "auth" | "rate_limit" | "unknown";

interface PoolKey {
  index: number;
  key: string;
  label: string;
  healthy: boolean;
  failureType?: FailureType;
  cooldownUntil?: number;
  authFailed: boolean;
  inFlightCount: number;
}

interface SessionAssignment {
  keyIndex: number;
}

interface ProviderPool {
  keys: PoolKey[];
  sessionAssignments: Map<string, SessionAssignment>;
  roundRobinCursor: number;
}

/** Result of a key selection — key value plus metadata for health reporting. */
export interface KeySelection {
  key: string;
  keyIndex: number;
  label: string;
}

/** Summary of a pool's health. */
export interface PoolHealthSummary {
  total: number;
  healthy: number;
  authFailed: number;
  rateLimited: number;
  providerFailed: number;
}

/** Auth result returned to provider clients. */
export interface AuthResult {
  apiKey?: string;
  authToken?: string;
  isOAuth: boolean;
  keyIndex?: number;
  label?: string;
}

/** Configuration for a single provider pool. */
export interface ProviderKeyConfig {
  keys: Array<{ key: string; label?: string }>;
}

/** Full key configuration — provider name → key list. */
export type KeyManagerConfig = Partial<Record<string, ProviderKeyConfig>>;

// ── KeyManager ────────────────────────────────────────────────────────────────

/**
 * Manages API key pools with rotation, quarantine, and session stickiness.
 *
 * @example
 * ```ts
 * const km = new KeyManager({
 *   anthropic: {
 *     keys: [
 *       { key: "sk-ant-...", label: "key-0" },
 *       { key: "sk-ant-...", label: "key-1" },
 *     ],
 *   },
 * });
 *
 * const auth = km.getAuth("anthropic", sessionId);
 * if (auth) {
 *   // use auth.apiKey
 * }
 * ```
 */
export class KeyManager {
  private pools = new Map<string, ProviderPool>();

  constructor(config?: KeyManagerConfig) {
    if (config) {
      this.configure(config);
    }
  }

  /**
   * Load or replace key configuration.
   * Merges into any existing pools by provider name.
   */
  configure(config: KeyManagerConfig): void {
    for (const [provider, providerCfg] of Object.entries(config)) {
      if (!providerCfg) continue;

      const pool: ProviderPool = {
        keys: providerCfg.keys.map((k, i) => ({
          index: i,
          key: k.key,
          label: k.label ?? `key-${i}`,
          healthy: true,
          authFailed: false,
          inFlightCount: 0,
        })),
        sessionAssignments: new Map(),
        roundRobinCursor: 0,
      };

      this.pools.set(provider, pool);
    }
  }

  /**
   * Check whether any keys are configured for a provider.
   */
  hasKeys(provider: string): boolean {
    const pool = this.pools.get(provider);
    return pool !== undefined && pool.keys.length > 0;
  }

  /**
   * Get auth credentials for a provider and session.
   * Returns null if no healthy keys are available.
   */
  getAuth(provider: string, sessionId: string): AuthResult | null {
    const pool = this.pools.get(provider);
    if (!pool || pool.keys.length === 0) return null;

    const keyIndex = this._assignKey(pool, sessionId);
    if (keyIndex === null) return null;

    const k = pool.keys[keyIndex];
    const isOAuth = k.key.includes("sk-ant-oat");

    return {
      ...(isOAuth ? { authToken: k.key } : { apiKey: k.key }),
      isOAuth,
      keyIndex: k.index,
      label: k.label,
    };
  }

  /**
   * Get a raw key selection without auth wrapping.
   * Useful for providers where you just need the key string.
   */
  getKeySelection(provider: string, sessionId: string): KeySelection | null {
    const pool = this.pools.get(provider);
    if (!pool || pool.keys.length === 0) return null;

    const keyIndex = this._assignKey(pool, sessionId);
    if (keyIndex === null) return null;

    const k = pool.keys[keyIndex];
    return { key: k.key, keyIndex: k.index, label: k.label };
  }

  /**
   * Mark a key as healthy — clears failure state.
   */
  markHealthy(provider: string, keyIndex: number): void {
    const key = this._getKey(provider, keyIndex);
    if (!key) return;

    key.healthy = true;
    key.authFailed = false;
    key.failureType = undefined;
    key.cooldownUntil = undefined;
  }

  /**
   * Mark a key as failed.
   *
   * @param cooldownMs - How long to quarantine the key. Defaults: auth=∞, rate_limit=15m, unknown=10m
   */
  markFailed(
    provider: string,
    keyIndex: number,
    reason: string,
    failureType: FailureType,
    cooldownMs?: number,
  ): void {
    const key = this._getKey(provider, keyIndex);
    if (!key) return;

    key.healthy = false;
    key.failureType = failureType;

    if (failureType === "auth") {
      key.authFailed = true;
      key.cooldownUntil = undefined; // Auth failures are permanent until cleared
    } else {
      const defaultCooldown =
        failureType === "rate_limit" ? 15 * 60_000 : 10 * 60_000;
      key.cooldownUntil = Date.now() + (cooldownMs ?? defaultCooldown);
    }
  }

  /**
   * Mark the current key for a session as failed.
   * The session will be rotated to a new key on the next `getAuth()` call.
   */
  markSessionFailed(
    provider: string,
    sessionId: string,
    reason: string,
    failureType: FailureType,
    cooldownMs?: number,
  ): void {
    const pool = this.pools.get(provider);
    if (!pool) return;

    const assignment = pool.sessionAssignments.get(sessionId);
    if (assignment !== undefined) {
      this.markFailed(provider, assignment.keyIndex, reason, failureType, cooldownMs);
    }
  }

  /**
   * Rotate a session to a different key.
   * Returns `true` if a new key was assigned, `false` if none available.
   */
  rotateSession(provider: string, sessionId: string, reason: string): boolean {
    const pool = this.pools.get(provider);
    if (!pool) return false;

    // Clear current assignment so _assignKey picks a fresh one
    pool.sessionAssignments.delete(sessionId);

    const newIndex = this._assignKey(pool, sessionId, /* excludeCurrent */ pool.sessionAssignments.get(sessionId)?.keyIndex);
    return newIndex !== null;
  }

  /**
   * Track that a request has started on a key.
   */
  trackRequestStart(provider: string, keyIndex: number): void {
    const key = this._getKey(provider, keyIndex);
    if (key) key.inFlightCount++;
  }

  /**
   * Track that a request has ended on a key.
   */
  trackRequestEnd(provider: string, keyIndex: number, _success: boolean): void {
    const key = this._getKey(provider, keyIndex);
    if (key) key.inFlightCount = Math.max(0, key.inFlightCount - 1);
  }

  /**
   * Get a health summary for a provider pool.
   */
  getPoolHealthSummary(provider: string): PoolHealthSummary {
    const pool = this.pools.get(provider);
    if (!pool) return { total: 0, healthy: 0, authFailed: 0, rateLimited: 0, providerFailed: 0 };

    const now = Date.now();
    let healthy = 0;
    let authFailed = 0;
    let rateLimited = 0;
    let providerFailed = 0;

    for (const k of pool.keys) {
      if (k.authFailed) {
        authFailed++;
      } else if (k.cooldownUntil && k.cooldownUntil > now) {
        if (k.failureType === "rate_limit") rateLimited++;
        else providerFailed++;
      } else {
        healthy++;
      }
    }

    return { total: pool.keys.length, healthy, authFailed, rateLimited, providerFailed };
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _assignKey(pool: ProviderPool, sessionId: string, excludeIndex?: number): number | null {
    // Return existing assignment if still healthy
    const existing = pool.sessionAssignments.get(sessionId);
    if (existing !== undefined) {
      const k = pool.keys[existing.keyIndex];
      if (k && this._isHealthy(k) && existing.keyIndex !== excludeIndex) {
        return existing.keyIndex;
      }
    }

    // Find next healthy key via round-robin, preferring low in-flight count
    const now = Date.now();
    const candidates = pool.keys
      .filter((k) => this._isHealthy(k) && k.index !== excludeIndex)
      .sort((a, b) => a.inFlightCount - b.inFlightCount);

    if (candidates.length === 0) return null;

    // Pick from candidates using round-robin cursor
    const selected = candidates[pool.roundRobinCursor % candidates.length];
    pool.roundRobinCursor = (pool.roundRobinCursor + 1) % Math.max(1, candidates.length);

    pool.sessionAssignments.set(sessionId, { keyIndex: selected.index });
    return selected.index;
  }

  private _isHealthy(key: PoolKey): boolean {
    if (key.authFailed) return false;
    if (key.cooldownUntil && key.cooldownUntil > Date.now()) return false;
    return true;
  }

  private _getKey(provider: string, keyIndex: number): PoolKey | null {
    const pool = this.pools.get(provider);
    if (!pool) return null;
    return pool.keys.find((k) => k.index === keyIndex) ?? null;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _manager: KeyManager | null = null;

/**
 * Get the process-level KeyManager singleton.
 * Call `configureKeyManager()` before first use.
 */
export function getKeyManager(): KeyManager {
  if (!_manager) {
    _manager = new KeyManager();
  }
  return _manager;
}

/**
 * Configure the singleton key manager with API keys.
 *
 * @example
 * ```ts
 * configureKeyManager({
 *   anthropic: { keys: [{ key: process.env.ANTHROPIC_API_KEY! }] },
 *   openai:    { keys: [{ key: process.env.OPENAI_API_KEY! }] },
 * });
 * ```
 */
export function configureKeyManager(config: KeyManagerConfig): void {
  getKeyManager().configure(config);
}
