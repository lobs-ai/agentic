/**
 * Core memory types for @agentic/memory.
 *
 * Memory entries represent durable knowledge that should persist across agent
 * sessions — things a fresh agent instance needs to know that it can't derive
 * from code, config, or conversation history alone.
 */

// ── Memory categories ─────────────────────────────────────────────────────────

/**
 * The category of a memory entry, reflecting how it was acquired.
 *
 * - `learning`   — Something discovered through experience: debugging insights, API quirks
 * - `decision`   — An explicit choice about something ongoing: architecture, approach, WHY
 * - `pattern`    — Recurring behaviour worth recognising across sessions
 * - `preference` — A durable user preference about how things should work going forward
 * - `fact`       — Concrete, durable fact: project structure, key people, URLs, configs
 * - `document`   — A chunk of an indexed document (markdown, notes, etc.)
 */
export type MemoryType =
  | "learning"
  | "decision"
  | "pattern"
  | "preference"
  | "fact"
  | "document";

/**
 * The scope of a memory — who it applies to.
 *
 * - `system`  — Applies to the entire system / all agents
 * - `agent`   — Applies to a specific agent persona
 * - `session` — Scoped to a session or project context
 */
export type MemoryScope = "system" | "agent" | "session";

/** Lifecycle status of a memory entry. */
export type MemoryStatus = "active" | "superseded" | "archived";

// ── Core entry type ───────────────────────────────────────────────────────────

/**
 * A memory entry — the fundamental unit of the memory store.
 */
export interface MemoryEntry {
  /** Unique identifier. Provider-assigned (auto-increment integer or UUID string). */
  id: string | number;
  /** What kind of memory this is. */
  memoryType: MemoryType;
  /** Short human-readable title (3–8 words). */
  title: string;
  /** The memory content — concise, 1–4 sentences. */
  content: string;
  /** Confidence score [0, 1]. Higher = more certain. */
  confidence: number;
  /** Scope this memory applies to. */
  scope: MemoryScope;
  /**
   * Authority of the source:
   * - 0 = reflection-extracted (inferred by the system)
   * - 1 = agent-stated (explicitly written by the agent)
   */
  sourceAuthority: 0 | 1;
  /** Lifecycle status. */
  status: MemoryStatus;
  /** ISO timestamp when memory was first derived. */
  derivedAt: string;
  /** ISO timestamp when memory was last accessed. */
  lastAccessed?: string;
  /** ISO timestamp when confidence was last validated. */
  lastValidated?: string;
  /** How many times this memory has been retrieved. */
  accessCount: number;
  /** Optional project or workspace ID this memory belongs to. */
  projectId?: string;
  /** Optional collection tag (e.g. 'workspace', 'docs', 'personal'). */
  collection?: string;
  /** For document chunks: path to the source file. */
  sourcePath?: string;
  /** For document chunks: which chunk index within the file. */
  chunkIndex?: number;
  /** SHA1 hash of the content, used for deduplication. */
  contentHash?: string;
}

/**
 * A candidate memory extracted from agent text, before it's been validated
 * and stored. Produced by the extractor.
 */
export interface MemoryCandidate {
  title: string;
  content: string;
  memoryType: MemoryType;
  confidence: number;
  /** 0 = reflection-extracted, 1 = agent-stated */
  sourceAuthority: 0 | 1;
  scope: MemoryScope;
  /** IDs of source events/messages that support this memory. */
  evidenceIds: (string | number)[];
}

// ── Search types ──────────────────────────────────────────────────────────────

/** A search result — a memory entry paired with a relevance score. */
export interface SearchResult {
  entry: MemoryEntry;
  /** Combined relevance score [0, 1]. Higher = more relevant. */
  score: number;
  /** How this result was matched. */
  matchType: "fts" | "vector" | "hybrid" | "keyword";
  /** How many evidence links this memory has (store-dependent). */
  evidenceCount?: number;
  /** Matched snippet if different from full content. */
  snippet?: string;
}

/** Options for searching the memory store. */
export interface SearchOptions {
  /** Maximum number of results to return. Default: 10. */
  maxResults?: number;
  /** Filter to specific memory types. */
  memoryTypes?: MemoryType[];
  /** Filter to a specific scope. */
  scope?: MemoryScope;
  /** Filter to a specific project. */
  projectId?: string;
  /** Minimum confidence threshold [0, 1]. Default: 0.3. */
  minConfidence?: number;
  /** Whether to include superseded memories. Default: false. */
  includeSuperseded?: boolean;
  /** Whether to include document chunks. Default: true. */
  includeDocuments?: boolean;
  /** Filter to specific collections. */
  collections?: string[];
}

// ── Store types ───────────────────────────────────────────────────────────────

/** Options for reading a file from a path. */
export interface ReadOptions {
  /** Start line (1-indexed). Default: 1. */
  from?: number;
  /** Number of lines to read. Default: 50, max: 200. */
  lines?: number;
}

/** Filter options for listing memory entries. */
export interface MemoryFilter {
  memoryTypes?: MemoryType[];
  scope?: MemoryScope;
  projectId?: string;
  collection?: string;
  status?: MemoryStatus;
  /** Return only entries with confidence >= this value. */
  minConfidence?: number;
  /** Maximum entries to return. */
  limit?: number;
  /** Sort order. Default: 'recent'. */
  orderBy?: "recent" | "confidence" | "accessCount";
}

/** Options for writing a memory entry. */
export interface WriteOptions {
  /** If true, attempt to deduplicate against existing similar memories. */
  deduplicate?: boolean;
}

// ── Extractor types ───────────────────────────────────────────────────────────

/** A cluster of events/messages to extract memories from. */
export interface EventCluster {
  /** Priority hint for the cluster. */
  priority: "high" | "medium" | "low";
  /** Human-readable reason this cluster was selected. */
  reason: string;
  /** The events/messages in the cluster. */
  events: MemoryEvent[];
}

/** A single event in a cluster — a message, tool call, or action. */
export interface MemoryEvent {
  /** Unique identifier. */
  id: number;
  /** Event type. */
  eventType:
    | "user_input"
    | "agent_output"
    | "tool_call"
    | "tool_result"
    | "error"
    | "decision";
  /** Text content of the event. */
  content: string;
  /** ISO timestamp. */
  timestamp: string;
  /** How important/signal-rich this event is [0, 1]. */
  signalScore: number;
}

/** Configuration for the extraction LLM call. */
export interface ExtractorConfig {
  /**
   * Agent/bot name, used to personalise the extraction prompt.
   * @default 'the agent'
   */
  agentName?: string;
  /**
   * Owner/user name, used to personalise the extraction prompt.
   * @default 'the user'
   */
  ownerName?: string;
  /**
   * Additional context about the agent and its projects.
   */
  agentContext?: string;
  /**
   * Model identifier to use for extraction.
   * @default provider default (claude-haiku recommended)
   */
  model?: string;
  /**
   * Maximum tokens in the extraction response.
   * @default 2048
   */
  maxResponseTokens?: number;
}

// ── Indexer types ─────────────────────────────────────────────────────────────

/** Configuration for the file indexer. */
export interface FileIndexerConfig {
  /** Directories to watch and index. */
  watchDirs: Array<{
    path: string;
    collection: string;
    recursive: boolean;
  }>;
  /** Chunking strategy. Default: 'heading'. */
  chunkStrategy?: "heading" | "fixed";
  /** Maximum tokens per chunk. Default: 400. */
  maxChunkTokens?: number;
  /** How often to rescan (ms). Default: 900_000 (15 min). */
  rescanIntervalMs?: number;
  /** Embedding batch size. Default: 10. */
  batchSize?: number;
  /**
   * URL of the embeddings API (OpenAI-compatible).
   * If omitted, embeddings are skipped (keyword-only search).
   */
  embedUrl?: string;
  /** Model name to use for embeddings. */
  embedModel?: string;
}
