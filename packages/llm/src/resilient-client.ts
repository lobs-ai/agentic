/**
 * Resilient LLM Client
 *
 * Wraps any `LLMClient` with:
 * - Automatic retries with exponential backoff
 * - Fallback chains (try next model if current one fails)
 * - Key rotation on rate-limit errors (when KeyManager is configured)
 * - Circuit breaker integration (skip dead models)
 * - Detailed error logging
 *
 * This is the recommended client for production use.
 */

import { createClient } from "./client.js";
import { parseModelString } from "./client.js";
import { getCircuitBreaker } from "./circuit-breaker.js";
import { getKeyManager } from "./key-manager.js";
import type {
  LLMClient,
  LLMResponse,
  CreateMessageParams,
  ClientConfig,
  ResilientClientOptions,
} from "./types.js";

// ── Retry helpers ─────────────────────────────────────────────────────────────

/** Sleep for `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay.
 * @param attempt - 0-based attempt index
 * @param baseMs - Base delay in ms (default 1000)
 * @param maxMs - Maximum delay cap (default 30000)
 */
function backoffDelay(attempt: number, baseMs = 1000, maxMs = 30_000): number {
  const jitter = Math.random() * 0.3; // ±30% jitter
  const delay = baseMs * Math.pow(2, attempt) * (1 + jitter);
  return Math.min(delay, maxMs);
}

// ── Error classification ──────────────────────────────────────────────────────

interface ClassifiedError {
  isRetryable: boolean;
  isRateLimit: boolean;
  isAuthFailure: boolean;
  isTransient: boolean;
  message: string;
}

function classifyError(err: unknown): ClassifiedError {
  const message = err instanceof Error ? err.message : String(err);
  const statusCode = (err as { status?: number })?.status;

  const isAuthFailure =
    statusCode === 401 ||
    statusCode === 403 ||
    message.includes("invalid_api_key") ||
    message.includes("Unauthorized") ||
    message.includes("authentication");

  const isRateLimit =
    statusCode === 429 ||
    message.toLowerCase().includes("rate limit") ||
    message.toLowerCase().includes("rate_limit") ||
    message.toLowerCase().includes("too many requests");

  const isTransient =
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    message.includes("ECONNRESET") ||
    message.includes("ENOTFOUND") ||
    message.includes("ETIMEDOUT") ||
    message.toLowerCase().includes("overloaded") ||
    message.toLowerCase().includes("service unavailable");

  const isRetryable = isRateLimit || isTransient;

  return { isRetryable, isRateLimit, isAuthFailure, isTransient, message };
}

// ── ModelAttempt ──────────────────────────────────────────────────────────────

/** One attempt entry in the execution log. */
export interface AttemptRecord {
  model: string;
  attempt: number;
  success: boolean;
  errorMessage?: string;
  durationMs?: number;
}

// ── ResilientLLMClient ────────────────────────────────────────────────────────

/**
 * An `LLMClient` that automatically retries and falls back across models.
 *
 * @example
 * ```ts
 * const client = new ResilientLLMClient(
 *   "anthropic/claude-sonnet-4-20250514",
 *   {
 *     fallbackModels: ["openai/gpt-4.1", "openai/gpt-4.1-mini"],
 *     maxRetries: 3,
 *     sessionId: "my-agent-session",
 *   },
 * );
 *
 * const response = await client.createMessage({
 *   model: "claude-sonnet-4-20250514",
 *   system: "You are helpful.",
 *   messages: [{ role: "user", content: "Hi!" }],
 *   tools: [],
 *   maxTokens: 1024,
 * });
 * ```
 */
export class ResilientLLMClient implements LLMClient {
  private models: string[];
  private maxRetries: number;
  private sessionId: string;
  private clientConfig?: ClientConfig;
  private attemptLog: AttemptRecord[] = [];

  constructor(
    primaryModel: string,
    options: ResilientClientOptions = {},
    clientConfig?: ClientConfig,
  ) {
    this.models = [primaryModel, ...(options.fallbackModels ?? [])];
    this.maxRetries = options.maxRetries ?? 3;
    this.sessionId = options.sessionId ?? `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.clientConfig = clientConfig;
  }

  async createMessage(params: CreateMessageParams): Promise<LLMResponse> {
    this.attemptLog = [];

    const breaker = getCircuitBreaker();
    const keyManager = getKeyManager();

    for (const modelString of this.models) {
      // Skip models with open circuits
      if (!breaker.isAvailable(modelString)) {
        console.warn(`[resilient-client] Circuit open for ${modelString}, skipping`);
        continue;
      }

      const { provider } = parseModelString(modelString);
      let lastError: unknown = null;

      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        // Rotate key on retries
        if (attempt > 0 && keyManager.hasKeys(provider)) {
          keyManager.rotateSession(provider, this.sessionId, "retry");
        }

        // Get auth for this attempt
        let perAttemptConfig = this.clientConfig;
        if (keyManager.hasKeys(provider)) {
          const auth = keyManager.getAuth(provider, this.sessionId);
          if (auth?.apiKey) {
            perAttemptConfig = {
              ...this.clientConfig,
              keys: {
                ...this.clientConfig?.keys,
                [provider]: { keys: [{ key: auth.apiKey, label: auth.label }] },
              },
            };
          }
        }

        // Build the provider-specific model param (strip provider prefix)
        const { modelId } = parseModelString(modelString);
        const attemptParams = { ...params, model: modelId };

        const t0 = Date.now();
        try {
          const client = createClient(modelString, perAttemptConfig);
          const response = await client.createMessage(attemptParams);

          // Success!
          breaker.recordSuccess(modelString);
          if (keyManager.hasKeys(provider)) {
            const auth = keyManager.getAuth(provider, this.sessionId);
            if (auth?.keyIndex !== undefined) {
              keyManager.markHealthy(provider, auth.keyIndex);
            }
          }

          this.attemptLog.push({
            model: modelString,
            attempt,
            success: true,
            durationMs: Date.now() - t0,
          });

          return response;
        } catch (err) {
          const classified = classifyError(err);
          const durationMs = Date.now() - t0;

          this.attemptLog.push({
            model: modelString,
            attempt,
            success: false,
            errorMessage: classified.message,
            durationMs,
          });

          lastError = err;

          // Handle auth failures — mark key dead, skip model
          if (classified.isAuthFailure) {
            console.error(`[resilient-client] Auth failure for ${modelString}: ${classified.message}`);
            if (keyManager.hasKeys(provider)) {
              keyManager.markSessionFailed(provider, this.sessionId, classified.message, "auth");
            }
            break; // Don't retry auth failures
          }

          // Handle rate limits — mark key for cooldown, rotate
          if (classified.isRateLimit) {
            console.warn(`[resilient-client] Rate limited on ${modelString} (attempt ${attempt + 1})`);
            if (keyManager.hasKeys(provider)) {
              keyManager.markSessionFailed(provider, this.sessionId, classified.message, "rate_limit");
            }
          }

          // Record failure in circuit breaker
          breaker.recordFailure(modelString, "crash");

          // Last retry for this model
          if (attempt >= this.maxRetries - 1) break;

          // Backoff before retry
          const delay = backoffDelay(attempt);
          console.warn(
            `[resilient-client] ${modelString} attempt ${attempt + 1} failed: ${classified.message}. ` +
              `Retrying in ${Math.round(delay)}ms...`,
          );
          await sleep(delay);
        }
      }

      console.error(
        `[resilient-client] All ${this.maxRetries} attempts failed for ${modelString}. ` +
          `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      );
    }

    // All models exhausted
    const summary = this.attemptLog
      .map((a) => `${a.model}[${a.attempt}]: ${a.success ? "ok" : a.errorMessage}`)
      .join("; ");
    throw new Error(`All LLM providers failed. Attempts: ${summary}`);
  }

  /**
   * Get the log of all attempts made during the last `createMessage()` call.
   * Useful for debugging and observability.
   */
  getAttemptLog(): AttemptRecord[] {
    return [...this.attemptLog];
  }

  /**
   * The active model list (primary + fallbacks).
   */
  getModels(): string[] {
    return [...this.models];
  }
}

// ── Factory function ──────────────────────────────────────────────────────────

/**
 * Create a `ResilientLLMClient` with retries and optional fallback chain.
 *
 * This is the recommended entry point for production use.
 *
 * @param primaryModel - Primary model string, e.g. "anthropic/claude-sonnet-4-20250514"
 * @param options - Fallback models, retry count, session ID
 * @param config - API keys and base URL overrides
 *
 * @example
 * ```ts
 * import { createResilientClient } from "@agentic/llm";
 *
 * const client = createResilientClient(
 *   "anthropic/claude-sonnet-4-20250514",
 *   { fallbackModels: ["openai/gpt-4.1"] },
 * );
 *
 * const response = await client.createMessage({
 *   model: "claude-sonnet-4-20250514",
 *   system: "You are helpful.",
 *   messages: [{ role: "user", content: "Hello!" }],
 *   tools: [],
 *   maxTokens: 1024,
 * });
 * ```
 */
export function createResilientClient(
  primaryModel: string,
  options?: ResilientClientOptions,
  config?: ClientConfig,
): ResilientLLMClient {
  return new ResilientLLMClient(primaryModel, options, config);
}
