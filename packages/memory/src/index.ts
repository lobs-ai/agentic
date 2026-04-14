/**
 * @agentic/memory — Memory and knowledge system for AI agents.
 *
 * Gives agents the ability to remember, search, and learn across sessions.
 *
 * Quick start:
 * ```ts
 * import { FileMemoryStore, extractMemoriesFromText } from '@agentic/memory';
 *
 * const store = new FileMemoryStore('~/.agent/memory');
 *
 * // Write a memory directly
 * await store.write({
 *   memoryType: 'learning',
 *   title: 'Rate limiting workaround',
 *   content: 'Always add 200ms delay between API calls to avoid 429s.',
 *   confidence: 0.9,
 *   scope: 'system',
 *   sourceAuthority: 1,
 *   status: 'active',
 * });
 *
 * // Search memories
 * const results = await store.search('API rate limits');
 *
 * // Extract memories from a conversation using your LLM
 * const candidates = await extractMemoriesFromText(conversationText, myLlmCaller);
 * for (const candidate of candidates) {
 *   await store.writeCandidate?.(candidate);
 * }
 * ```
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  MemoryType,
  MemoryScope,
  MemoryStatus,
  MemoryEntry,
  MemoryCandidate,
  SearchResult,
  SearchOptions,
  ReadOptions,
  MemoryFilter,
  WriteOptions,
  EventCluster,
  MemoryEvent,
  ExtractorConfig,
  FileIndexerConfig,
} from "./types.js";

// ── Store interface + helpers ─────────────────────────────────────────────────
export type { MemoryStore, MemoryWriteInput } from "./store.js";
export {
  CANDIDATE_THRESHOLDS,
  MEMORY_TYPE_WEIGHTS,
  candidateMeetsThreshold,
  importanceScore,
  decayedConfidence,
} from "./store.js";

// ── Search utilities ──────────────────────────────────────────────────────────
export type { GrepResult } from "./search.js";
export {
  cosineSimilarity,
  fetchEmbedding,
  keywordSearch,
  grepFiles,
} from "./search.js";

// ── Extractor ─────────────────────────────────────────────────────────────────
export type { LlmCaller } from "./extractor.js";
export {
  buildSystemPrompt,
  buildUserPrompt,
  extractMemories,
  extractMemoriesFromText,
} from "./extractor.js";

// ── Indexer ───────────────────────────────────────────────────────────────────
export {
  FileIndexer,
  headingChunks,
  fixedChunks,
} from "./indexer.js";

// ── File store ────────────────────────────────────────────────────────────────
export type { FileMemoryStoreOptions } from "./file-store.js";
export { FileMemoryStore } from "./file-store.js";

// ── SQLite store (re-exported for convenience) ────────────────────────────────
// Note: SqliteMemoryStore depends on `better-sqlite3`. If you only want the
// file-based store, import from '@agentic/memory' without this re-export.
export type { SqliteMemoryStoreOptions } from "./providers/sqlite.js";
export { SqliteMemoryStore } from "./providers/sqlite.js";
