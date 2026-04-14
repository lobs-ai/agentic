/**
 * Memory extractor — uses an LLM to extract candidate memories from event
 * clusters (conversation turns, tool outputs, decisions).
 *
 * Philosophy: importance is the only filter. Tool calls, routine file reads,
 * and mechanical actions are noise. Decisions, learnings, user preferences,
 * debugging insights, and architectural choices are signal.
 *
 * This module is LLM-agnostic: provide your own `callLlm` function.
 */

import type {
  MemoryCandidate,
  MemoryType,
  MemoryScope,
  EventCluster,
  ExtractorConfig,
} from "./types.js";
import { candidateMeetsThreshold } from "./store.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max chars of event content to include per extraction call. */
const MAX_CONTENT_CHARS = 15_000;

// ── Prompt construction ───────────────────────────────────────────────────────

/**
 * Build the system prompt for memory extraction.
 */
export function buildSystemPrompt(config: ExtractorConfig = {}): string {
  const agentName  = config.agentName  ?? "the agent";
  const ownerName  = config.ownerName  ?? "the user";
  const agentCtx   = config.agentContext ?? "";

  return `You are a memory extraction assistant for an AI agent called ${agentName}. Your job is to identify memories that will be USEFUL IN FUTURE SESSIONS — things a fresh agent instance needs to know that it cannot find in code, git history, or docs.
${agentCtx ? `\nContext about ${agentName} and ${ownerName}:\n${agentCtx}\n` : ""}
Memory types:
- learning:   Something discovered through experience — debugging insights, API quirks, what worked/didn't
- decision:   An explicit choice about something ONGOING — architecture, approach, tool selection, and WHY
- pattern:    Recurring behaviour worth recognising across sessions
- preference: A DURABLE user preference about how things should be done going forward (not a one-time instruction)
- fact:       Concrete, durable fact — project structure, key people, URLs, configurations

THE KEY QUESTION: "Will a fresh agent session need this information, and can it NOT get it from code/git/docs?"

EXTRACT:
- Durable user preferences ("always use TypeScript", "don't send messages about low-priority things")
- People and relationships (who works on what, who has what role)
- External system quirks that aren't documented (API gotchas, service limitations)
- Hard-won debugging insights where the root cause was non-obvious
- Project domain knowledge that lives nowhere else
- User facts (schedule, preferences, background) stated naturally in conversation

SKIP:
- Implementation details ("changed X to Y", "removed the cap") — git is the record
- Session-local directives ("fix this bug") — instructions, not preferences
- Code changes, refactors, config tweaks — the code is the record
- Ephemeral status ("system is healthy", "build passed")
- Descriptions of what was just built — the PR/commit describes it
- Anything re-derivable by reading the codebase

A "preference" means the user wants something GOING FORWARD, not that they asked for something this session.

If there is nothing worth remembering for future sessions, return an empty array [].
Most sessions should produce 0–2 memories. Returning [] is the RIGHT answer for routine work.

Output ONLY a JSON array. No prose, no markdown fences. Each element:
{
  "title": "<short 3-8 word title>",
  "content": "<concise 1-3 sentence memory>",
  "memoryType": "learning|decision|pattern|preference|fact",
  "confidence": <0.0-1.0>,
  "sourceAuthority": <0 or 1>,
  "scope": "system|agent|session",
  "evidenceIds": [<event id numbers>]
}

Rules:
- Confidence 0.9+ only for directly stated facts or explicit user preferences
- sourceAuthority=1 only when the user explicitly states something
- evidenceIds must reference actual event IDs from the input
- Fewer is better — one good memory beats five mediocre ones`;
}

/**
 * Build the user prompt from a cluster of events.
 * Prioritises high-signal events and stays within the character budget.
 */
export function buildUserPrompt(cluster: EventCluster): string {
  const lines: string[] = [];
  let chars = 0;

  // Sort: user_input and errors first, then by signalScore desc
  const prioritized = [...cluster.events].sort((a, b) => {
    const priority = (e: EventCluster["events"][0]) => {
      if (e.eventType === "user_input")  return 4;
      if (e.eventType === "error")       return 3;
      if (e.eventType === "decision")    return 2;
      if (e.eventType === "agent_output") return 1;
      return 0;
    };
    const pd = priority(b) - priority(a);
    return pd !== 0 ? pd : b.signalScore - a.signalScore;
  });

  for (const event of prioritized) {
    // Skip low-signal tool results once we have enough content
    if (
      event.eventType === "tool_result" &&
      event.signalScore < 0.4 &&
      chars > MAX_CONTENT_CHARS * 0.3
    ) continue;

    const ts      = event.timestamp.slice(0, 19);
    const content = event.content.length > 600
      ? event.content.slice(0, 600) + "…"
      : event.content;
    const line = `[${event.id}] ${ts} ${event.eventType.toUpperCase()} (signal=${event.signalScore.toFixed(1)}): ${content}`;

    if (chars + line.length > MAX_CONTENT_CHARS) continue;
    lines.push(line);
    chars += line.length;
  }

  return `Extract memories from these agent events (cluster: ${cluster.priority} priority — ${cluster.reason}):\n\n${lines.join("\n")}`;
}

// ── Response parsing ──────────────────────────────────────────────────────────

function parseJsonArray(text: string): unknown[] {
  const cleaned = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  const start = cleaned.indexOf("[");
  const end   = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON array found in LLM response`);
  }

  return JSON.parse(cleaned.slice(start, end + 1)) as unknown[];
}

function validateCandidate(raw: unknown): MemoryCandidate | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const content = typeof obj.content === "string" ? obj.content.trim() : "";
  if (!content) return null;

  const title = typeof obj.title === "string" ? obj.title.trim() : content.slice(0, 50);

  const validTypes: MemoryType[] = [
    "learning", "decision", "pattern", "preference", "fact", "document",
  ];
  const memoryType = validTypes.includes(obj.memoryType as MemoryType)
    ? (obj.memoryType as MemoryType)
    : null;
  if (!memoryType) return null;

  const confidence: number =
    typeof obj.confidence === "number"
      ? Math.max(0, Math.min(1, obj.confidence))
      : 0;

  const sourceAuthority: 0 | 1 = obj.sourceAuthority === 1 ? 1 : 0;

  const validScopes: MemoryScope[] = ["system", "agent", "session"];
  const scope: MemoryScope = validScopes.includes(obj.scope as MemoryScope)
    ? (obj.scope as MemoryScope)
    : "session";

  const evidenceIds = Array.isArray(obj.evidenceIds)
    ? (obj.evidenceIds as unknown[]).filter((id) => typeof id === "number").map(Number)
    : [];

  return { title, content, memoryType, confidence, sourceAuthority, scope, evidenceIds };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * A minimal LLM call interface — provide your own implementation.
 *
 * @example
 * ```ts
 * import Anthropic from '@anthropic-ai/sdk';
 * const anthropic = new Anthropic();
 *
 * const callLlm: LlmCaller = async (system, user) => {
 *   const resp = await anthropic.messages.create({
 *     model: 'claude-haiku-4-5',
 *     system,
 *     messages: [{ role: 'user', content: user }],
 *     max_tokens: 2048,
 *   });
 *   return resp.content
 *     .filter((b) => b.type === 'text')
 *     .map((b) => b.text)
 *     .join('');
 * };
 * ```
 */
export type LlmCaller = (system: string, user: string) => Promise<string>;

/**
 * Extract candidate memories from an event cluster using an LLM.
 *
 * Returns an empty array when there's nothing worth extracting.
 * LLM errors are thrown so the caller can retry with backoff.
 *
 * @param cluster  The event cluster to extract from
 * @param callLlm  Your LLM call function (model-agnostic)
 * @param config   Extractor configuration
 */
export async function extractMemories(
  cluster: EventCluster,
  callLlm: LlmCaller,
  config: ExtractorConfig = {},
): Promise<MemoryCandidate[]> {
  if (cluster.events.length === 0) return [];

  const systemPrompt = buildSystemPrompt(config);
  const userPrompt   = buildUserPrompt(cluster);

  // Throws on LLM error — let caller handle retry/backoff
  const text = await callLlm(systemPrompt, userPrompt);
  if (!text.trim()) return [];

  let rawItems: unknown[];
  try {
    rawItems = parseJsonArray(text);
  } catch {
    return []; // Parse failure is not retryable
  }

  const candidates: MemoryCandidate[] = [];
  for (const item of rawItems) {
    const candidate = validateCandidate(item);
    if (!candidate) continue;
    if (!candidateMeetsThreshold(candidate, candidate.evidenceIds.length)) continue;
    candidates.push(candidate);
  }

  return candidates;
}

/**
 * Extract memories from a plain text conversation (not structured events).
 *
 * Wraps the text in a synthetic single-event cluster and calls `extractMemories`.
 * Useful for processing raw conversation logs or session transcripts.
 *
 * @param text     The conversation or session text
 * @param callLlm  Your LLM call function
 * @param config   Extractor configuration
 */
export async function extractMemoriesFromText(
  text: string,
  callLlm: LlmCaller,
  config: ExtractorConfig = {},
): Promise<MemoryCandidate[]> {
  const cluster: EventCluster = {
    priority: "medium",
    reason:   "text extraction",
    events: [
      {
        id:        1,
        eventType: "agent_output",
        content:   text,
        timestamp: new Date().toISOString(),
        signalScore: 0.7,
      },
    ],
  };

  return extractMemories(cluster, callLlm, config);
}
