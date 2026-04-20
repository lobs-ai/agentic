/**
 * Shared utilities for the @agentic/llm package.
 */

// Strips reasoning-model scratchpad blocks emitted by DeepSeek, MiniMax, GLM,
// and Kimi R-series models. Also handles unterminated trailing blocks caused
// by max_tokens truncation.
const THINK_BLOCK = /<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi;
const UNTERMINATED_TRAILING = /<(think|thinking|reasoning)>[\s\S]*$/i;

export function stripReasoning(text: string): string {
  return text.replace(THINK_BLOCK, "").replace(UNTERMINATED_TRAILING, "").trim();
}
