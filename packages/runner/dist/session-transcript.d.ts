/**
 * Session transcript persistence.
 *
 * Saves conversation history to JSONL during agent runs, and generates
 * a human-readable Markdown summary on completion.
 *
 * File layout:
 * ```
 * ~/.lobs/agents/{agentType}/sessions/{runId}.jsonl   — machine-readable
 * ~/.lobs/agents/{agentType}/sessions/{runId}.md       — human-readable
 * ```
 *
 * Each JSONL line is a turn record. The final line is a summary entry
 * with `"type": "summary"`.
 */
import type { TokenUsage } from "./types.js";
export interface TurnRecord {
    turn: number;
    timestamp: string;
    toolCalls: Array<{
        name: string;
        input: Record<string, unknown>;
    }>;
    usage: TokenUsage;
}
export interface SessionSummary {
    type: "summary";
    runId: string;
    agentType: string;
    taskId?: string;
    succeeded: boolean;
    totalTurns: number;
    totalUsage: TokenUsage;
    durationSeconds: number;
    stopReason: string;
    error?: string;
    timestamp: string;
}
export declare class SessionTranscript {
    private readonly sessionPath;
    private readonly markdownPath;
    private readonly startTime;
    constructor(agentType: string, runId: string);
    /** Append a turn record to the JSONL file. */
    writeTurn(record: TurnRecord): void;
    /** Write the final summary entry and generate the Markdown file. */
    writeComplete(runId: string, agentType: string, succeeded: boolean, totalTurns: number, usage: TokenUsage, stopReason: string, error?: string): void;
    private generateMarkdown;
}
//# sourceMappingURL=session-transcript.d.ts.map