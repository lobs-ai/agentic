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
import { OpenAIClient } from "./openai.js";
// ── Known Endpoints ───────────────────────────────────────────────────────────
/** Well-known base URLs for popular OpenAI-compatible providers. */
export const KNOWN_ENDPOINTS = {
    openrouter: "https://openrouter.ai/api/v1",
    lmstudio: "http://localhost:1234/v1",
    "opencode-zen": "http://localhost:3000/v1",
    "opencode-go": "http://localhost:3100/v1",
    "z-ai": "https://api.z.ai/v1",
    minimax: "https://api.minimaxi.chat/v1",
    kimi: "https://api.moonshot.cn/v1",
};
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
export class OpenAICompatibleClient {
    inner;
    constructor(options) {
        this.inner = new OpenAIClient({
            apiKey: options.apiKey ?? "not-required",
            baseURL: options.baseURL,
            defaultHeaders: options.defaultHeaders,
        });
    }
    createMessage(params) {
        return this.inner.createMessage(params);
    }
}
/**
 * Build an `OpenAICompatibleClient` for a named provider using its
 * well-known endpoint.
 *
 * @throws if the provider has no known endpoint and no `baseURL` is provided.
 */
export function buildCompatibleClient(opts) {
    const baseURL = opts.baseURL ?? KNOWN_ENDPOINTS[opts.provider];
    if (!baseURL) {
        throw new Error(`No known endpoint for provider "${opts.provider}". ` +
            `Pass a baseURL explicitly or add it to KNOWN_ENDPOINTS.`);
    }
    return new OpenAICompatibleClient({
        apiKey: opts.apiKey,
        baseURL,
        defaultHeaders: opts.defaultHeaders,
    });
}
/**
 * Strip the "openrouter/" prefix from a model string.
 * OpenRouter model IDs are passed as-is (e.g. "anthropic/claude-sonnet-4").
 */
export function stripOpenRouterPrefix(model) {
    return model.startsWith("openrouter/") ? model.slice("openrouter/".length) : model;
}
//# sourceMappingURL=openai-compatible.js.map