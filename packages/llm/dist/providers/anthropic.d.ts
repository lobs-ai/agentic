/**
 * Anthropic Provider
 *
 * Wraps the official `@anthropic-ai/sdk` to satisfy the `LLMClient` interface.
 *
 * Features:
 * - Extended thinking (enabled/adaptive)
 * - Prompt caching via cache_control headers
 * - Tool use
 * - Full token usage reporting (cache read/write/thinking tokens)
 */
import type { LLMClient, LLMResponse, CreateMessageParams } from "../types.js";
/** Options for constructing an AnthropicClient. */
export interface AnthropicClientOptions {
    /** API key. Defaults to ANTHROPIC_API_KEY env var. */
    apiKey?: string;
    /** OAuth bearer token (used instead of API key when present). */
    authToken?: string;
    /** Base URL override. */
    baseURL?: string;
}
/**
 * LLM client backed by the Anthropic Messages API.
 *
 * @example
 * ```ts
 * const client = new AnthropicClient({ apiKey: process.env.ANTHROPIC_API_KEY });
 * const response = await client.createMessage({
 *   model: "claude-sonnet-4-20250514",
 *   system: "You are a helpful assistant.",
 *   messages: [{ role: "user", content: "Hello!" }],
 *   tools: [],
 *   maxTokens: 1024,
 * });
 * console.log(response.content[0].type === "text" && response.content[0].text);
 * ```
 */
export declare class AnthropicClient implements LLMClient {
    private sdk;
    constructor(options?: AnthropicClientOptions);
    createMessage(params: CreateMessageParams): Promise<LLMResponse>;
}
//# sourceMappingURL=anthropic.d.ts.map