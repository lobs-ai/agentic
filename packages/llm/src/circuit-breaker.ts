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

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 10,
  cooldownMinutes: 30,
  windowMinutes: 60,
  enabled: true,
};

// ── Internal State ────────────────────────────────────────────────────────────

interface FailureRecord {
  timestamp: number;
  reason: FailureReason;
}

interface CircuitRecord {
  state: CircuitState;
  failures: FailureRecord[];
  openedAt?: number;
  lastSuccessAt?: number;
}

// ── CircuitBreaker ────────────────────────────────────────────────────────────

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
export class CircuitBreaker {
  private circuits = new Map<string, CircuitRecord>();
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check whether a model is available for calls.
   * Returns `true` if the circuit is closed or half-open (probe allowed).
   */
  isAvailable(modelKey: string): boolean {
    if (!this.config.enabled) return true;

    const circuit = this.circuits.get(modelKey);
    if (!circuit) return true; // No failures recorded yet

    switch (circuit.state) {
      case "closed":
        return true;

      case "open": {
        const cooldownMs = this.config.cooldownMinutes * 60_000;
        const elapsed = Date.now() - (circuit.openedAt ?? 0);
        if (elapsed >= cooldownMs) {
          circuit.state = "half-open";
          return true; // Allow one probe
        }
        return false;
      }

      case "half-open":
        return true; // Already in recovery probe
    }
  }

  /**
   * Record a successful call — closes the circuit if it was half-open.
   */
  recordSuccess(modelKey: string): void {
    const circuit = this.circuits.get(modelKey);
    if (!circuit) return;

    circuit.state = "closed";
    circuit.failures = [];
    circuit.openedAt = undefined;
    circuit.lastSuccessAt = Date.now();
  }

  /**
   * Record a failed call.
   * Prunes stale failures, increments count, opens the circuit if threshold is hit.
   */
  recordFailure(modelKey: string, reason: FailureReason): void {
    if (!this.config.enabled) return;

    let circuit = this.circuits.get(modelKey);
    if (!circuit) {
      circuit = { state: "closed", failures: [] };
      this.circuits.set(modelKey, circuit);
    }

    // Prune failures outside the window
    const windowMs = this.config.windowMinutes * 60_000;
    const cutoff = Date.now() - windowMs;
    circuit.failures = circuit.failures.filter((f) => f.timestamp >= cutoff);

    circuit.failures.push({ timestamp: Date.now(), reason });

    if (circuit.failures.length >= this.config.failureThreshold) {
      circuit.state = "open";
      circuit.openedAt = Date.now();
    } else if (circuit.state === "half-open") {
      // Probe failed — re-open
      circuit.state = "open";
      circuit.openedAt = Date.now();
    }
  }

  /**
   * Get the current state of a circuit.
   */
  getState(modelKey: string): CircuitState {
    return this.circuits.get(modelKey)?.state ?? "closed";
  }

  /**
   * Get the failure count for a model within the current window.
   */
  getFailureCount(modelKey: string): number {
    const circuit = this.circuits.get(modelKey);
    if (!circuit) return 0;

    const windowMs = this.config.windowMinutes * 60_000;
    const cutoff = Date.now() - windowMs;
    return circuit.failures.filter((f) => f.timestamp >= cutoff).length;
  }

  /**
   * Get a status summary for all tracked circuits.
   */
  getStatus(): Record<string, { state: CircuitState; failureCount: number; openedAt?: number }> {
    const result: Record<string, { state: CircuitState; failureCount: number; openedAt?: number }> = {};

    for (const [key, circuit] of this.circuits) {
      result[key] = {
        state: circuit.state,
        failureCount: this.getFailureCount(key),
        openedAt: circuit.openedAt,
      };
    }

    return result;
  }

  /**
   * Reset a specific circuit (or all circuits if no key provided).
   */
  reset(modelKey?: string): void {
    if (modelKey) {
      this.circuits.delete(modelKey);
    } else {
      this.circuits.clear();
    }
  }

  /**
   * Update the circuit breaker configuration.
   */
  configure(config: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _breaker: CircuitBreaker | null = null;

/**
 * Get (or create) the process-level circuit breaker singleton.
 * All provider clients share this by default.
 */
export function getCircuitBreaker(): CircuitBreaker {
  if (!_breaker) {
    _breaker = new CircuitBreaker();
  }
  return _breaker;
}

/**
 * Replace the singleton circuit breaker (useful for testing).
 */
export function setCircuitBreaker(cb: CircuitBreaker): void {
  _breaker = cb;
}
