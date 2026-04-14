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
import { mkdirSync, appendFileSync, writeFileSync, existsSync } from "node:fs";
// ── SessionTranscript ─────────────────────────────────────────────────────────
export class SessionTranscript {
    sessionPath;
    markdownPath;
    startTime = Date.now();
    constructor(agentType, runId) {
        const homeDir = process.env["HOME"] ?? "";
        const sessionsDir = `${homeDir}/.lobs/agents/${agentType}/sessions`;
        mkdirSync(sessionsDir, { recursive: true });
        this.sessionPath = `${sessionsDir}/${runId}.jsonl`;
        this.markdownPath = `${sessionsDir}/${runId}.md`;
    }
    /** Append a turn record to the JSONL file. */
    writeTurn(record) {
        appendFileSync(this.sessionPath, JSON.stringify(record) + "\n");
    }
    /** Write the final summary entry and generate the Markdown file. */
    writeComplete(runId, agentType, succeeded, totalTurns, usage, stopReason, error) {
        const summary = {
            type: "summary",
            runId,
            agentType,
            succeeded,
            totalTurns,
            totalUsage: usage,
            durationSeconds: Math.floor((Date.now() - this.startTime) / 1000),
            stopReason,
            error,
            timestamp: new Date().toISOString(),
        };
        appendFileSync(this.sessionPath, JSON.stringify(summary) + "\n");
        this.generateMarkdown(summary);
    }
    generateMarkdown(summary) {
        if (existsSync(this.markdownPath))
            return;
        const lines = [
            `# Agent Session: ${summary.runId}`,
            `**Agent**: ${summary.agentType}`,
            `**Date**: ${summary.timestamp}`,
            `**Status**: ${summary.succeeded ? "✅ Succeeded" : "❌ Failed"}`,
            `**Turns**: ${summary.totalTurns}`,
            `**Duration**: ${summary.durationSeconds}s`,
            `**Tokens**: ${summary.totalUsage.inputTokens} in / ${summary.totalUsage.outputTokens} out`,
            `**Stop reason**: ${summary.stopReason}`,
        ];
        if (summary.error) {
            lines.push(`**Error**: ${summary.error}`);
        }
        writeFileSync(this.markdownPath, lines.join("\n") + "\n");
    }
}
//# sourceMappingURL=session-transcript.js.map