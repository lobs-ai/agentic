/**
 * Agent loop — the core LLM ↔ tool execution cycle.
 *
 * Multi-provider: Anthropic (native), OpenAI, any OpenAI-compatible endpoint.
 * Uses the @agentic/llm provider abstraction to normalise all responses.
 *
 * Loop:
 * 1. Build system prompt
 * 2. Call LLM with current messages + tool definitions
 * 3. stop_reason == "end_turn" / "stop" → done
 * 4. stop_reason == "tool_use" → execute tools → append results → goto 2
 * 5. maxTurns exceeded or timeout → forced stop
 */
import { type AgentSpec, type AgentResult } from "./types.js";
export type { AgentSpec, AgentResult };
/**
 * Run an agent through the LLM tool loop until completion, timeout, or
 * max turns.
 */
export declare function runAgent(spec: AgentSpec): Promise<AgentResult>;
export { estimateTokens } from "./context-manager.js";
//# sourceMappingURL=agent-loop.d.ts.map