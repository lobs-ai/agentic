/**
 * Loop detector — detects when an agent is making the same tool calls
 * repeatedly without making progress.
 *
 * Patterns detected:
 * 1. Generic repeat  — same tool + same input called N times
 * 2. Poll no-progress — same tool always returns identical output
 * 3. Ping-pong        — alternating A/B/A/B pattern
 */
export class LoopDetector {
    history = [];
    maxHistory = 30;
    warningThreshold = 8;
    criticalThreshold = 15;
    /** Record a tool call and check for loops. */
    record(name, input, output) {
        const inputHash = simpleHash(JSON.stringify(input));
        const outputHash = simpleHash(output.substring(0, 500));
        this.history.push({ name, inputHash, outputHash, timestamp: Date.now() });
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        return this.detect();
    }
    reset() {
        this.history = [];
    }
    detect() {
        const genericRepeat = this.detectGenericRepeat();
        if (genericRepeat)
            return genericRepeat;
        const pollNoProgress = this.detectPollNoProgress();
        if (pollNoProgress)
            return pollNoProgress;
        const pingPong = this.detectPingPong();
        if (pingPong)
            return pingPong;
        return { detected: false, type: null, message: null, severity: null };
    }
    detectGenericRepeat() {
        if (this.history.length < this.warningThreshold)
            return null;
        const recent = this.history.slice(-this.warningThreshold);
        const first = recent[0];
        const allSame = recent.every((r) => r.name === first.name && r.inputHash === first.inputHash);
        if (!allSame)
            return null;
        const count = recent.length;
        const severity = count >= this.criticalThreshold ? "critical" : "warning";
        return {
            detected: true,
            type: "generic-repeat",
            message: `Called ${first.name} with identical input ${count} times`,
            severity,
        };
    }
    detectPollNoProgress() {
        if (this.history.length < this.warningThreshold)
            return null;
        const recent = this.history.slice(-this.warningThreshold);
        const first = recent[0];
        const sameToolSameOutput = recent.every((r) => r.name === first.name && r.outputHash === first.outputHash);
        if (!sameToolSameOutput)
            return null;
        return {
            detected: true,
            type: "poll-no-progress",
            message: `Tool ${first.name} returning identical output ${recent.length} times — no progress`,
            severity: "warning",
        };
    }
    detectPingPong() {
        if (this.history.length < 6)
            return null;
        const recent = this.history.slice(-6);
        const a = recent[0].name;
        const b = recent[1].name;
        if (a === b)
            return null;
        const isPingPong = recent.every((r, i) => r.name === (i % 2 === 0 ? a : b));
        if (!isPingPong)
            return null;
        return {
            detected: true,
            type: "ping-pong",
            message: `Alternating between ${a} and ${b} without progress`,
            severity: "warning",
        };
    }
}
function simpleHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return h.toString(36);
}
//# sourceMappingURL=loop-detector.js.map