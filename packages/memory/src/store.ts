/**
 * MemoryStore interface — the core abstraction for reading and writing memories.
 *
 * Implementations:
 * - SqliteMemoryStore  (providers/sqlite.ts) — SQLite with FTS5 and optional vector search
 * - FileMemoryStore    (file-store.ts)       — simple markdown file storage
 */

import type {
  MemoryEntry,
  MemoryCandidate,
  SearchResult,
  SearchOptions,
  ReadOptions,
  MemoryFilter,
  WriteOptions,
} from "./types.js";

// ── Core interface ────────────────────────────────────────────────────────────

/**
 * Input type for writing a new memory entry. `id`, `accessCount`, and `derivedAt`
 * are optional — the store will assign them if omitted.
 */
export type MemoryWriteInput = Omit<MemoryEntry, "id" | "accessCount" | "derivedAt"> &
  Partial<Pick<MemoryEntry, "id" | "accessCount" | "derivedAt">>;

/**
 * The primary interface for agent memory storage.
 *
 * All implementations must support:
 * - `write`  — persist a memory entry (or update an existing one)
 * - `search` — retrieve relevant memories by semantic query
 * - `read`   — read raw text from a file path (for file-backed stores)
 * - `list`   — enumerate memory entries with optional filters
 */
export interface MemoryStore {
  /** Write a memory entry. If entry has an `id`, the store may update the existing entry. */
  write(entry: MemoryWriteInput, options?: WriteOptions): Promise<MemoryEntry>;

  /** Search for relevant memories using a natural-language query. Results sorted by score desc. */
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  /**
   * Read raw text from a file path.
   * Returns line-numbered content for easy citation.
   */
  read(path: string, options?: ReadOptions): Promise<string>;

  /** List memory entries with optional filtering. */
  list(filter?: MemoryFilter): Promise<MemoryEntry[]>;

  /**
   * Validate and persist an extracted memory candidate.
   * Returns the persisted entry, or null if the candidate was rejected.
   */
  writeCandidate?(candidate: MemoryCandidate, options?: WriteOptions): Promise<MemoryEntry | null>;

  /** Delete a memory entry by ID. */
  delete?(id: string | number): Promise<void>;

  /** Release any resources (DB connections, file handles, etc.). */
  close?(): Promise<void>;
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

/**
 * Default candidate validation thresholds by memory type.
 * Candidates must meet both minEvents and minConfidence to be stored.
 */
export const CANDIDATE_THRESHOLDS: Record<
  string,
  { minEvents: number; minConfidence: number }
> = {
  learning:   { minEvents: 1, minConfidence: 0.6 },
  decision:   { minEvents: 1, minConfidence: 0.7 },
  pattern:    { minEvents: 2, minConfidence: 0.5 },
  preference: { minEvents: 1, minConfidence: 0.7 },
  fact:       { minEvents: 1, minConfidence: 0.8 },
  document:   { minEvents: 1, minConfidence: 0.5 },
};

/**
 * Check whether a candidate meets the minimum thresholds for its type.
 */
export function candidateMeetsThreshold(
  candidate: MemoryCandidate,
  evidenceCount: number,
): boolean {
  const threshold = CANDIDATE_THRESHOLDS[candidate.memoryType];
  if (!threshold) return false;
  if (evidenceCount < threshold.minEvents) return false;
  if (candidate.confidence < threshold.minConfidence) return false;
  return true;
}

/**
 * Score multipliers applied after relevance scoring, by memory type.
 * Keeps durable, actionable types ranked above raw facts or document chunks.
 */
export const MEMORY_TYPE_WEIGHTS: Record<string, number> = {
  decision:   1.15,
  learning:   1.12,
  pattern:    1.08,
  preference: 1.06,
  fact:       1.0,
  document:   0.9,
};

/**
 * Compute the importance score of a memory entry.
 * Incorporates type bias, source authority, and access count.
 */
export function importanceScore(entry: MemoryEntry): number {
  const typeWeight = MEMORY_TYPE_WEIGHTS[entry.memoryType] ?? 1.0;
  const authorityBoost = entry.sourceAuthority === 1 ? 0.1 : 0;
  const accessFloor = Math.min(entry.accessCount / 50, 0.1);
  return Math.min(typeWeight * (entry.confidence + authorityBoost + accessFloor), 1);
}

/**
 * Apply exponential confidence decay based on time since last validation.
 * Facts never decay. Other types decay at type-specific half-life rates.
 */
export function decayedConfidence(entry: MemoryEntry): number {
  if (entry.memoryType === "fact") return entry.confidence;

  const halfLifeDays: Record<string, number> = {
    decision:   365,
    learning:   180,
    pattern:    90,
    preference: 365,
    document:   365,
  };

  const halfLife = halfLifeDays[entry.memoryType] ?? 180;
  const lastValidated = entry.lastValidated ?? entry.derivedAt;
  const daysSince =
    (Date.now() - new Date(lastValidated).getTime()) / (1000 * 60 * 60 * 24);
  return entry.confidence * Math.pow(0.5, daysSince / halfLife);
}
