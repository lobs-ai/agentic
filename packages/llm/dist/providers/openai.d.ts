/**
 * OpenAI Provider
 *
 * Wraps the official `openai` SDK to satisfy the `LLMClient` interface.
 *
 * Handles:
 * - Chat completions with tool calling
 * - Full token usage reporting
 * - Normalising OpenAI's message format to the shared LLMMessage format
 */
import type { LLMClient, LLMResponse, CreateMessageParams } from "../types.js";
/** Options for constructing an OpenAIClient. */
export interface OpenAIClientOptions {
    /** API key. Defaults to OPENAI_API_KEY env var. */
    apiKey?: string;
    /** Base URL override. Use for Azure OpenAI, proxies, or compatible APIs. */
    baseURL?: string;
    /** Default request headers. */
    defaultHeaders?: Record<string, string>;
}
/**
 * LLM client backed by the OpenAI Chat Completions API.
 *
 * @example
 * ```ts
 * const client = new OpenAIClient({ apiKey: process.env.OPENAI_API_KEY });
 * const response = await client.createMessage({
 *   model: "gpt-4.1",
 *   system: "You are a helpful assistant.",
 *   messages: [{ role: "user", content: "Hello!" }],
 *   tools: [],
 *   maxTokens: 1024,
 * });
 * ```
 */
export declare class OpenAIClient implements LLMClient {
    private sdk;
    constructor(options?: OpenAIClientOptions);
    createMessage(params: CreateMessageParams): Promise<LLMResponse>;
}
//# sourceMappingURL=openai.d.ts.map