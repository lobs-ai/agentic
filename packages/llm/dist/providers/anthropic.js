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
import Anthropic from "@anthropic-ai/sdk";
function buildAnthropicMessages(messages) {
    return messages.map((msg) => {
        if (typeof msg.content === "string") {
            return { role: msg.role, content: msg.content };
        }
        // Rich content (tool results, tool use blocks, etc.) — pass through as-is
        return { role: msg.role, content: msg.content };
    });
}
function mapStopReason(reason) {
    switch (reason) {
        case "end_turn":
            return "end_turn";
        case "tool_use":
            return "tool_use";
        case "max_tokens":
            return "max_tokens";
        case "stop_sequence":
            return "stop";
        default:
            return "end_turn";
    }
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
export class AnthropicClient {
    sdk;
    constructor(options = {}) {
        const sdkOptions = {};
        if (options.baseURL)
            sdkOptions.baseURL = options.baseURL;
        if (options.authToken) {
            sdkOptions.authToken = options.authToken;
        }
        else if (options.apiKey) {
            sdkOptions.apiKey = options.apiKey;
        }
        // If neither provided, SDK reads ANTHROPIC_API_KEY from env
        this.sdk = new Anthropic(sdkOptions);
    }
    async createMessage(params) {
        const { model, system, messages, tools, maxTokens, thinking, } = params;
        // Build request body
        const requestBody = {
            model,
            system,
            messages: buildAnthropicMessages(messages),
            max_tokens: maxTokens,
            tools: tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.input_schema,
            })),
        };
        // Extended thinking — cast to any to set fields not in the strict SDK types
        // (thinking, betas) before the call
        const finalBody = requestBody;
        if (thinking) {
            if (thinking.type === "enabled") {
                finalBody.thinking = {
                    type: "enabled",
                    budget_tokens: thinking.budgetTokens,
                };
                // When thinking is enabled, betas must be set and temperature forced to 1
                finalBody.betas = ["interleaved-thinking-2025-05-14"];
                finalBody.temperature = 1;
            }
            else if (thinking.type === "adaptive") {
                finalBody.thinking = { type: "adaptive" };
                finalBody.temperature = 1;
            }
        }
        // Use non-streaming overload — cast via unknown to avoid union with Stream<>
        const raw = await this.sdk.messages.create(finalBody);
        // Parse content blocks
        const content = [];
        let thinkingContent;
        for (const block of raw.content) {
            if (block.type === "thinking") {
                thinkingContent = (thinkingContent ?? "") + block.thinking;
            }
            else if (block.type === "text") {
                content.push({ type: "text", text: block.text });
            }
            else if (block.type === "tool_use") {
                content.push({
                    type: "tool_use",
                    id: block.id,
                    name: block.name,
                    input: block.input,
                });
            }
        }
        // Parse usage
        const msg = raw;
        const rawUsage = msg.usage;
        const usage = {
            inputTokens: rawUsage.input_tokens ?? 0,
            outputTokens: rawUsage.output_tokens ?? 0,
            cacheReadTokens: rawUsage.cache_read_input_tokens ?? 0,
            cacheWriteTokens: rawUsage.cache_creation_input_tokens ?? 0,
        };
        return {
            content,
            stopReason: mapStopReason(msg.stop_reason),
            usage,
            ...(thinkingContent !== undefined ? { thinkingContent } : {}),
        };
    }
}
//# sourceMappingURL=anthropic.js.map