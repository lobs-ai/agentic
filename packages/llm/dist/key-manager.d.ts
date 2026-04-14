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
type FailureType = "auth" | "rate_limit" | "unknown";
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
    keys: Array<{
        key: string;
        label?: string;
    }>;
}
/** Full key configuration — provider name → key list. */
export type KeyManagerConfig = Partial<Record<string, ProviderKeyConfig>>;
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
export declare class KeyManager {
    private pools;
    constructor(config?: KeyManagerConfig);
    /**
     * Load or replace key configuration.
     * Merges into any existing pools by provider name.
     */
    configure(config: KeyManagerConfig): void;
    /**
     * Check whether any keys are configured for a provider.
     */
    hasKeys(provider: string): boolean;
    /**
     * Get auth credentials for a provider and session.
     * Returns null if no healthy keys are available.
     */
    getAuth(provider: string, sessionId: string): AuthResult | null;
    /**
     * Get a raw key selection without auth wrapping.
     * Useful for providers where you just need the key string.
     */
    getKeySelection(provider: string, sessionId: string): KeySelection | null;
    /**
     * Mark a key as healthy — clears failure state.
     */
    markHealthy(provider: string, keyIndex: number): void;
    /**
     * Mark a key as failed.
     *
     * @param cooldownMs - How long to quarantine the key. Defaults: auth=∞, rate_limit=15m, unknown=10m
     */
    markFailed(provider: string, keyIndex: number, reason: string, failureType: FailureType, cooldownMs?: number): void;
    /**
     * Mark the current key for a session as failed.
     * The session will be rotated to a new key on the next `getAuth()` call.
     */
    markSessionFailed(provider: string, sessionId: string, reason: string, failureType: FailureType, cooldownMs?: number): void;
    /**
     * Rotate a session to a different key.
     * Returns `true` if a new key was assigned, `false` if none available.
     */
    rotateSession(provider: string, sessionId: string, reason: string): boolean;
    /**
     * Track that a request has started on a key.
     */
    trackRequestStart(provider: string, keyIndex: number): void;
    /**
     * Track that a request has ended on a key.
     */
    trackRequestEnd(provider: string, keyIndex: number, _success: boolean): void;
    /**
     * Get a health summary for a provider pool.
     */
    getPoolHealthSummary(provider: string): PoolHealthSummary;
    private _assignKey;
    private _isHealthy;
    private _getKey;
}
/**
 * Get the process-level KeyManager singleton.
 * Call `configureKeyManager()` before first use.
 */
export declare function getKeyManager(): KeyManager;
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
export declare function configureKeyManager(config: KeyManagerConfig): void;
export {};
//# sourceMappingURL=key-manager.d.ts.map