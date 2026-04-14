/**
 * @agentic/runner — core types
 *
 * All public-facing interfaces for the agent execution loop.
 */
import type { LLMClient, LLMMessage, ToolDefinition } from "@agentic/llm";
/**
 * Everything the runner needs to execute an agent.
 */
export interface AgentSpec {
    /** Task prompt — what the agent should do. */
    task: string;
    /** Agent type label (programmer, writer, researcher, etc.). */
    agent: string;
    /**
     * Model string in "provider/model-id" format.
     * @example "anthropic/claude-sonnet-4-20250514"
     */
    model: string;
    /** Working directory for exec / file operations. */
    cwd: string;
    /** Tools to make available to the agent. */
    tools: string[];
    /** Maximum wall-clock time in seconds before the run is aborted. */
    timeout: number;
    /** System prompt override. When omitted the runner uses a generic prompt. */
    systemPrompt?: string;
    /** Maximum LLM turns before a forced stop. Defaults to 100. */
    maxTurns?: number;
    /** Maximum tokens per LLM response. Defaults to 16384. */
    maxTokens?: number;
    /**
     * Seed the loop with an explicit message history instead of
     * the bare task prompt. Useful for resuming interrupted runs.
     */
    initialMessages?: LLMMessage[];
    /**
     * Override the LLM client. When omitted a resilient client is built
     * from `model` automatically.
     */
    clientOverride?: LLMClient;
    /**
     * Override tool execution. When omitted the built-in tool registry is used.
     * Provides a seam for injecting environment-specific tool implementations.
     */
    toolExecutor?: ToolExecutor;
    /** Arbitrary context passed into the agent (task IDs, channel IDs, notes). */
    context?: AgentContext;
    /** Callback fired on progress events (tool start/result, phase changes). */
    onProgress?: (update: ProgressUpdate) => void;
    /** Model tier hint used for selecting fallback chains. */
    modelTier?: string;
    /**
     * Rewrite or sanitize assistant content blocks before they are stored
     * back into the message history. Useful for stripping extended thinking
     * blocks that must not appear in history.
     */
    sanitizeResponseContent?: (content: import("@agentic/llm").ContentBlock[]) => import("@agentic/llm").ContentBlock[];
}
/** Signature for a custom tool executor injected via `AgentSpec.toolExecutor`. */
export type ToolExecutor = (toolName: string, params: Record<string, unknown>, toolUseId: string, cwd: string, context?: {
    channelId?: string;
    toolUseId?: string;
}) => Promise<ToolResult>;
/** Structured context passed into an agent run. */
export interface AgentContext {
    taskId?: string;
    channelId?: string;
    parentTaskId?: string;
    sessionId?: string;
    workflowId?: string;
    files?: string[];
    notes?: string;
    instructions?: string;
}
/** The outcome of a completed agent run. */
export interface AgentResult {
    /** Whether the run completed successfully. */
    succeeded: boolean;
    /** Final text output from the agent (last assistant text block). */
    output: string;
    /** Error message when `succeeded` is false. */
    error?: string;
    /** Cumulative token usage across all turns. */
    usage: TokenUsage;
    /** Estimated cost in USD. */
    costUsd: number;
    /** Number of LLM turns executed. */
    turns: number;
    /** Unique run identifier (hex string). */
    runId: string;
}
/** Cumulative token accounting across all turns of a run. */
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    thinkingTokens?: number;
}
/** The result of executing a single tool call. */
export interface ToolResult {
    /** Must match the `id` from the LLM's tool_use block. */
    toolUseId: string;
    /** Tool output — string or structured content blocks. */
    content: string | Array<{
        type: string;
        text?: string;
    }>;
    /** True when the tool encountered an error. */
    is_error?: boolean;
}
/** A tool that can be registered in the runner's tool registry. */
export interface RunnerToolDefinition {
    definition: ToolDefinition;
    execute: (params: Record<string, unknown>, cwd: string) => Promise<{
        output: string;
        isError?: boolean;
    }>;
}
/** Current phase of the agent execution loop. */
export type AgentPhase = "initializing" | "thinking" | "executing" | "complete" | "failed";
/** A progress update fired via `AgentSpec.onProgress`. */
export interface ProgressUpdate {
    type: "tool_start" | "tool_result" | "thinking" | "phase_change";
    agentType: string;
    toolName?: string;
    toolInput?: Record<string, unknown>;
    result?: unknown;
    phase?: AgentPhase;
}
/** Per-million-token costs for known models. */
export declare const MODEL_COSTS: Record<string, {
    inputPerM: number;
    outputPerM: number;
}>;
//# sourceMappingURL=types.d.ts.map