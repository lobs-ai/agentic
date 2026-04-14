/**
 * Circuit Breaker
 *
 * Tracks repeated failures per model and opens the circuit to stop
 * hammering a broken model. Automatically recovers after a cooldown period.
 *
 * State machine:
 *   closed → open (after failureThreshold failures in windowMinutes)
 *   open → half-open (after cooldownMinutes)
 *   half-open → closed (on success) | open (on failure)
 */
import type { CircuitBreakerConfig, CircuitState, FailureReason } from "./types.js";
/**
 * Circuit breaker that tracks model health and prevents repeated calls to
 * failing models.
 *
 * @example
 * ```ts
 * const cb = new CircuitBreaker();
 *
 * if (!cb.isAvailable("anthropic/claude-sonnet-4-20250514")) {
 *   // use fallback
 * }
 *
 * try {
 *   const result = await client.createMessage(...);
 *   cb.recordSuccess("anthropic/claude-sonnet-4-20250514");
 * } catch (err) {
 *   cb.recordFailure("anthropic/claude-sonnet-4-20250514", "crash");
 *   throw err;
 * }
 * ```
 */
export declare class CircuitBreaker {
    private circuits;
    private config;
    constructor(config?: Partial<CircuitBreakerConfig>);
    /**
     * Check whether a model is available for calls.
     * Returns `true` if the circuit is closed or half-open (probe allowed).
     */
    isAvailable(modelKey: string): boolean;
    /**
     * Record a successful call — closes the circuit if it was half-open.
     */
    recordSuccess(modelKey: string): void;
    /**
     * Record a failed call.
     * Prunes stale failures, increments count, opens the circuit if threshold is hit.
     */
    recordFailure(modelKey: string, reason: FailureReason): void;
    /**
     * Get the current state of a circuit.
     */
    getState(modelKey: string): CircuitState;
    /**
     * Get the failure count for a model within the current window.
     */
    getFailureCount(modelKey: string): number;
    /**
     * Get a status summary for all tracked circuits.
     */
    getStatus(): Record<string, {
        state: CircuitState;
        failureCount: number;
        openedAt?: number;
    }>;
    /**
     * Reset a specific circuit (or all circuits if no key provided).
     */
    reset(modelKey?: string): void;
    /**
     * Update the circuit breaker configuration.
     */
    configure(config: Partial<CircuitBreakerConfig>): void;
}
/**
 * Get (or create) the process-level circuit breaker singleton.
 * All provider clients share this by default.
 */
export declare function getCircuitBreaker(): CircuitBreaker;
/**
 * Replace the singleton circuit breaker (useful for testing).
 */
export declare function setCircuitBreaker(cb: CircuitBreaker): void;
//# sourceMappingURL=circuit-breaker.d.ts.map