/**
 * OpenAI-Compatible Provider
 *
 * Generic client for any API that speaks the OpenAI Chat Completions protocol.
 * Supports LM Studio, OpenRouter, custom deployments, and hosted models.
 *
 * OpenRouter support includes:
 * - Provider routing via X-OR-* headers
 * - Automatic model path stripping (openrouter/provider/model → provider/model)
 */
import type { LLMClient, LLMResponse, CreateMessageParams } from "../types.js";
/** Well-known base URLs for popular OpenAI-compatible providers. */
export declare const KNOWN_ENDPOINTS: Record<string, string>;
/** Options for constructing an OpenAICompatibleClient. */
export interface OpenAICompatibleClientOptions {
    /** API key. Some providers (LM Studio) don't require one. */
    apiKey?: string;
    /** Base URL of the API endpoint. Required. */
    baseURL: string;
    /**
     * Additional headers to send with every request.
     * OpenRouter uses these for provider routing:
     * - `X-Title: <your-app>` — identifies your app in OpenRouter dashboards
     * - `HTTP-Referer: https://...` — optional metadata
     */
    defaultHeaders?: Record<string, string>;
}
/**
 * LLM client for any OpenAI-compatible API.
 * Delegates to `OpenAIClient` with a custom base URL.
 *
 * @example LM Studio (local)
 * ```ts
 * const client = new OpenAICompatibleClient({
 *   baseURL: "http://localhost:1234/v1",
 *   apiKey: "not-needed",
 * });
 * ```
 *
 * @example OpenRouter
 * ```ts
 * const client = new OpenAICompatibleClient({
 *   baseURL: "https://openrouter.ai/api/v1",
 *   apiKey: process.env.OPENROUTER_API_KEY,
 *   defaultHeaders: { "X-Title": "My Agent" },
 * });
 * ```
 */
export declare class OpenAICompatibleClient implements LLMClient {
    private inner;
    constructor(options: OpenAICompatibleClientOptions);
    createMessage(params: CreateMessageParams): Promise<LLMResponse>;
}
/** Options for building a client for a named compatible provider. */
export interface NamedCompatibleOptions {
    /** The short provider name (e.g. "openrouter", "lmstudio", "kimi"). */
    provider: string;
    /** API key for the provider. */
    apiKey?: string;
    /** Override the base URL (defaults to the known endpoint for this provider). */
    baseURL?: string;
    /** Additional headers. */
    defaultHeaders?: Record<string, string>;
}
/**
 * Build an `OpenAICompatibleClient` for a named provider using its
 * well-known endpoint.
 *
 * @throws if the provider has no known endpoint and no `baseURL` is provided.
 */
export declare function buildCompatibleClient(opts: NamedCompatibleOptions): OpenAICompatibleClient;
/**
 * Strip the "openrouter/" prefix from a model string.
 * OpenRouter model IDs are passed as-is (e.g. "anthropic/claude-sonnet-4").
 */
export declare function stripOpenRouterPrefix(model: string): string;
//# sourceMappingURL=openai-compatible.d.ts.map