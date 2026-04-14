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
import type { LLMClient, LLMResponse, CreateMessageParams, ClientConfig, ResilientClientOptions } from "./types.js";
/** One attempt entry in the execution log. */
export interface AttemptRecord {
    model: string;
    attempt: number;
    success: boolean;
    errorMessage?: string;
    durationMs?: number;
}
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
export declare class ResilientLLMClient implements LLMClient {
    private models;
    private maxRetries;
    private sessionId;
    private clientConfig?;
    private attemptLog;
    constructor(primaryModel: string, options?: ResilientClientOptions, clientConfig?: ClientConfig);
    createMessage(params: CreateMessageParams): Promise<LLMResponse>;
    /**
     * Get the log of all attempts made during the last `createMessage()` call.
     * Useful for debugging and observability.
     */
    getAttemptLog(): AttemptRecord[];
    /**
     * The active model list (primary + fallbacks).
     */
    getModels(): string[];
}
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
export declare function createResilientClient(primaryModel: string, options?: ResilientClientOptions, config?: ClientConfig): ResilientLLMClient;
//# sourceMappingURL=resilient-client.d.ts.map