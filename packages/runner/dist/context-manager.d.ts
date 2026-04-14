/**
 * Context window management.
 *
 * Tracks estimated token usage and compacts the message history when the
 * conversation approaches the model's context limit.
 *
 * Compaction strategy:
 * - Always keep the first user message (the task prompt).
 * - Keep the most recent N turns verbatim.
 * - For older turns: truncate long tool results to 500 chars.
 *
 * CRITICAL: Anthropic requires every tool_use block to have a matching
 * tool_result block immediately after. Compaction must never break that
 * pairing — we only truncate the *content* of tool_result blocks, never
 * remove them.
 */
import type { LLMMessage } from "@agentic/llm";
/**
 * Look up the context window limit for a model string.
 */
export declare function getContextLimit(model: string): number;
/**
 * Estimate token count for a message array.
 * Rough heuristic: 1 token ≈ 4 characters.
 */
export declare function estimateTokens(messages: LLMMessage[]): number;
/**
 * Returns true when the conversation is approaching the context limit
 * and should be compacted before the next LLM call.
 */
export declare function shouldCompact(messages: LLMMessage[], model: string): boolean;
/**
 * Compact the message history by truncating old tool results.
 *
 * @param messages        Current message array (mutated in-place via splice)
 * @param keepRecentTurns How many recent turns to leave untouched (default 5)
 * @returns New (shorter) message array
 */
export declare function compactMessages(messages: LLMMessage[], keepRecentTurns?: number): LLMMessage[];
//# sourceMappingURL=context-manager.d.ts.map