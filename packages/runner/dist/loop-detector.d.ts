/**
 * Loop detector — detects when an agent is making the same tool calls
 * repeatedly without making progress.
 *
 * Patterns detected:
 * 1. Generic repeat  — same tool + same input called N times
 * 2. Poll no-progress — same tool always returns identical output
 * 3. Ping-pong        — alternating A/B/A/B pattern
 */
export interface LoopDetectionResult {
    detected: boolean;
    type: "generic-repeat" | "poll-no-progress" | "ping-pong" | null;
    message: string | null;
    severity: "warning" | "critical" | null;
}
export declare class LoopDetector {
    private history;
    private readonly maxHistory;
    private readonly warningThreshold;
    private readonly criticalThreshold;
    /** Record a tool call and check for loops. */
    record(name: string, input: Record<string, unknown>, output: string): LoopDetectionResult;
    reset(): void;
    private detect;
    private detectGenericRepeat;
    private detectPollNoProgress;
    private detectPingPong;
}
//# sourceMappingURL=loop-detector.d.ts.map