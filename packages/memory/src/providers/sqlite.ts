/**
 * SqliteMemoryStore — SQLite-backed MemoryStore with FTS5 full-text search
 * and optional vector similarity search.
 *
 * Schema:
 * - `memories`          — core entries table
 * - `memories_fts`      — FTS5 virtual table mirroring title + content
 * - `memory_embeddings` — optional float32 blob per memory for vector search
 *
 * Search strategy:
 * 1. FTS5 full-text search (always available)
 * 2. Vector cosine similarity (if embeddings table populated)
 * 3. Hybrid: combine FTS rank + vector score with configurable weights
 *
 * Usage:
 * ```ts
 * import { SqliteMemoryStore } from '@agentic/memory/providers/sqlite';
 *
 * const store = new SqliteMemoryStore('~/.agent/memory.db');
 * await store.write({ memoryType: 'learning', title: 'Rate limit workaround', ... });
 * const results = await store.search('rate limit');
 * store.close();
 * ```
 */

import Database, { type Database as DB } from "better-sqlite3";
import * as fs   from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type {
  MemoryEntry,
  MemoryCandidate,
  SearchResult,
  SearchOptions,
  ReadOptions,
  MemoryFilter,
  WriteOptions,
  MemoryType,
  MemoryScope,
  MemoryStatus,
} from "../types.js";
import type { MemoryStore, MemoryWriteInput } from "../store.js";
import { candidateMeetsThreshold, MEMORY_TYPE_WEIGHTS, importanceScore } from "../store.js";
import { cosineSimilarity } from "../search.js";

// ── DB row types ──────────────────────────────────────────────────────────────

interface MemoryRow {
  id:               number;
  memory_type:      string;
  title:            string;
  content:          string;
  confidence:       number;
  scope:            string;
  source_authority: number;
  status:           string;
  derived_at:       string;
  last_accessed:    string | null;
  last_validated:   string | null;
  access_count:     number;
  project_id:       string | null;
  collection:       string | null;
  source_path:      string | null;
  chunk_index:      number | null;
  content_hash:     string | null;
}

interface EmbeddingRow {
  memory_id: number;
  vector:    Buffer;
  dim:       number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function expandHome(p: string): string {
  return p.replace(/^~/, process.env.HOME ?? "");
}

function sha1(text: string): string {
  return crypto.createHash("sha1").update(text).digest("hex");
}

function rowToEntry(row: MemoryRow): MemoryEntry {
  return {
    id:              row.id,
    memoryType:      row.memory_type      as MemoryType,
    title:           row.title,
    content:         row.content,
    confidence:      row.confidence,
    scope:           row.scope            as MemoryScope,
    sourceAuthority: (row.source_authority as 0 | 1),
    status:          row.status           as MemoryStatus,
    derivedAt:       row.derived_at,
    lastAccessed:    row.last_accessed    ?? undefined,
    lastValidated:   row.last_validated   ?? undefined,
    accessCount:     row.access_count,
    projectId:       row.project_id       ?? undefined,
    collection:      row.collection       ?? undefined,
    sourcePath:      row.source_path      ?? undefined,
    chunkIndex:      row.chunk_index      ?? undefined,
    contentHash:     row.content_hash     ?? undefined,
  };
}

function bufferToFloat32(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function float32ToBuffer(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

// ── DDL ───────────────────────────────────────────────────────────────────────

const DDL = `
CREATE TABLE IF NOT EXISTS memories (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_type      TEXT    NOT NULL,
  title            TEXT    NOT NULL DEFAULT '',
  content          TEXT    NOT NULL,
  confidence       REAL    NOT NULL DEFAULT 0.7,
  scope            TEXT    NOT NULL DEFAULT 'system',
  source_authority INTEGER NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'active',
  derived_at       TEXT    NOT NULL,
  last_accessed    TEXT,
  last_validated   TEXT,
  access_count     INTEGER NOT NULL DEFAULT 0,
  project_id       TEXT,
  collection       TEXT,
  source_path      TEXT,
  chunk_index      INTEGER,
  content_hash     TEXT
);

CREATE TABLE IF NOT EXISTS memory_embeddings (
  memory_id INTEGER PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  vector    BLOB    NOT NULL,
  dim       INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  title,
  content,
  content=memories,
  content_rowid=id
);

CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, content)
    VALUES ('delete', old.id, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, content)
    VALUES ('delete', old.id, old.title, old.content);
  INSERT INTO memories_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
END;

CREATE INDEX IF NOT EXISTS idx_memories_type   ON memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
CREATE INDEX IF NOT EXISTS idx_memories_scope  ON memories(scope);
CREATE INDEX IF NOT EXISTS idx_memories_coll   ON memories(collection);
CREATE INDEX IF NOT EXISTS idx_memories_path   ON memories(source_path);
`;

// ── SqliteMemoryStore ─────────────────────────────────────────────────────────

export interface SqliteMemoryStoreOptions {
  /**
   * Weight for FTS rank in hybrid search [0, 1]. Default: 0.6.
   * Vector weight = 1 - ftsWeight.
   */
  ftsWeight?: number;
  /** Maximum number of FTS candidates to rerank with vectors. Default: 50. */
  ftsTopK?: number;
}

export class SqliteMemoryStore implements MemoryStore {
  private readonly db:   DB;
  private readonly opts: Required<SqliteMemoryStoreOptions>;

  constructor(dbPath: string, opts: SqliteMemoryStoreOptions = {}) {
    const expanded = expandHome(dbPath);
    fs.mkdirSync(path.dirname(expanded), { recursive: true });

    this.db = new Database(expanded);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(DDL);

    this.opts = {
      ftsWeight: opts.ftsWeight ?? 0.6,
      ftsTopK:   opts.ftsTopK   ?? 50,
    };
  }

  // ── MemoryStore interface ───────────────────────────────────────────────────

  async write(input: MemoryWriteInput, _opts?: WriteOptions): Promise<MemoryEntry> {
    const now = new Date().toISOString();

    if (input.id !== undefined) {
      const existing = this.db
        .prepare("SELECT id FROM memories WHERE id = ?")
        .get(input.id) as { id: number } | undefined;

      if (existing) {
        this.db.prepare(`
          UPDATE memories SET
            memory_type      = ?,
            title            = ?,
            content          = ?,
            confidence       = ?,
            scope            = ?,
            source_authority = ?,
            status           = ?,
            last_validated   = ?,
            project_id       = ?,
            collection       = ?,
            source_path      = ?,
            chunk_index      = ?,
            content_hash     = ?
          WHERE id = ?
        `).run(
          input.memoryType,
          input.title,
          input.content,
          input.confidence,
          input.scope,
          input.sourceAuthority,
          input.status ?? "active",
          now,
          input.projectId   ?? null,
          input.collection  ?? null,
          input.sourcePath  ?? null,
          input.chunkIndex  ?? null,
          input.contentHash ?? sha1(input.content),
          input.id,
        );

        const row = this.db
          .prepare("SELECT * FROM memories WHERE id = ?")
          .get(input.id) as MemoryRow;
        return rowToEntry(row);
      }
    }

    const result = this.db.prepare(`
      INSERT INTO memories
        (memory_type, title, content, confidence, scope, source_authority,
         status, derived_at, access_count, project_id, collection,
         source_path, chunk_index, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.memoryType,
      input.title,
      input.content,
      input.confidence,
      input.scope,
      input.sourceAuthority,
      input.status      ?? "active",
      input.derivedAt   ?? now,
      input.accessCount ?? 0,
      input.projectId   ?? null,
      input.collection  ?? null,
      input.sourcePath  ?? null,
      input.chunkIndex  ?? null,
      input.contentHash ?? sha1(input.content),
    );

    const row = this.db
      .prepare("SELECT * FROM memories WHERE id = ?")
      .get(result.lastInsertRowid) as MemoryRow;
    return rowToEntry(row);
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    const maxResults    = opts.maxResults    ?? 10;
    const minConfidence = opts.minConfidence ?? 0.3;
    const ftsTopK       = this.opts.ftsTopK;

    // Build WHERE clause for filters
    const where: string[] = ["m.confidence >= ?"];
    const params: unknown[] = [minConfidence];

    if (!opts.includeSuperseded) {
      where.push("m.status = 'active'");
    }
    if (opts.memoryTypes?.length) {
      where.push(`m.memory_type IN (${opts.memoryTypes.map(() => "?").join(",")})`);
      params.push(...opts.memoryTypes);
    }
    if (opts.scope) {
      where.push("m.scope = ?");
      params.push(opts.scope);
    }
    if (opts.projectId) {
      where.push("m.project_id = ?");
      params.push(opts.projectId);
    }
    if (opts.includeDocuments === false) {
      where.push("m.memory_type != 'document'");
    }
    if (opts.collections?.length) {
      where.push(`m.collection IN (${opts.collections.map(() => "?").join(",")})`);
      params.push(...opts.collections);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // Escape FTS query
    const ftsQuery = query.replace(/['"]/g, " ");

    // FTS search
    let ftsRows: Array<MemoryRow & { fts_rank: number }> = [];
    try {
      ftsRows = this.db.prepare(`
        SELECT m.*, fts.rank AS fts_rank
        FROM memories_fts fts
        JOIN memories m ON m.id = fts.rowid
        ${whereClause}
          ${where.length ? "AND" : "WHERE"} memories_fts MATCH ?
        ORDER BY fts.rank
        LIMIT ?
      `).all([...params, ftsQuery, ftsTopK]) as Array<MemoryRow & { fts_rank: number }>;
    } catch {
      // FTS query may fail for special chars — fallback to full scan
      ftsRows = [];
    }

    // If FTS returned nothing, fall back to a broad scan
    if (ftsRows.length === 0) {
      const scanRows = this.db.prepare(`
        SELECT m.* FROM memories m
        ${whereClause}
        ORDER BY m.derived_at DESC
        LIMIT ?
      `).all([...params, ftsTopK]) as MemoryRow[];

      ftsRows = scanRows.map((r) => ({ ...r, fts_rank: -1 }));
    }

    // Normalise FTS rank: BM25 rank is negative; closer to 0 = more relevant
    const minRank = Math.min(...ftsRows.map((r) => r.fts_rank), -1e-9);
    const maxRank = Math.max(...ftsRows.map((r) => r.fts_rank), -1e-9);
    const rankRange = maxRank - minRank || 1;

    // Check if we have embeddings
    const hasEmbeddings = (this.db
      .prepare("SELECT COUNT(*) as c FROM memory_embeddings")
      .get() as { c: number }).c > 0;

    const scored: Array<{ entry: MemoryEntry; score: number }> = [];

    for (const row of ftsRows) {
      const entry = rowToEntry(row);

      // FTS component: normalise rank → [0, 1]
      const ftsScore = (row.fts_rank - minRank) / rankRange;

      let finalScore: number;

      if (hasEmbeddings) {
        // Try to get embedding for this row
        const embRow = this.db
          .prepare("SELECT vector, dim FROM memory_embeddings WHERE memory_id = ?")
          .get(row.id) as EmbeddingRow | undefined;

        if (embRow) {
          const vec = bufferToFloat32(embRow.vector);
          // We don't have the query embedding here — use FTS only
          // (caller should use searchWithEmbedding for vector reranking)
          finalScore = ftsScore;
          void vec; // suppress unused warning
        } else {
          finalScore = ftsScore;
        }
      } else {
        finalScore = ftsScore;
      }

      // Apply type weight and importance bias
      const typeWeight = MEMORY_TYPE_WEIGHTS[entry.memoryType] ?? 1.0;
      const importance = importanceScore(entry);
      finalScore = Math.min((finalScore * 0.75 + importance * 0.25) * typeWeight, 1);

      scored.push({ entry, score: finalScore });
    }

    scored.sort((a, b) => b.score - a.score);

    // Update access counts in the background
    const accessNow = new Date().toISOString();
    const ids = scored.slice(0, maxResults).map((s) => s.entry.id);
    for (const id of ids) {
      this.db.prepare(`
        UPDATE memories
        SET access_count = access_count + 1, last_accessed = ?
        WHERE id = ?
      `).run(accessNow, id);
    }

    return scored.slice(0, maxResults).map(({ entry, score }) => ({
      entry,
      score,
      matchType: "fts" as const,
    }));
  }

  /**
   * Vector-reranked search. Requires a query embedding vector.
   * Falls back to `search()` if no embeddings are stored.
   *
   * @param query      Natural-language query text (for FTS pass)
   * @param queryVec   Pre-computed query embedding
   * @param opts       Standard search options
   */
  async searchWithEmbedding(
    query: string,
    queryVec: Float32Array,
    opts: SearchOptions = {},
  ): Promise<SearchResult[]> {
    const maxResults = opts.maxResults ?? 10;

    // Get FTS candidates (expanded pool)
    const ftsResults = await this.search(query, { ...opts, maxResults: this.opts.ftsTopK });
    if (ftsResults.length === 0) return [];

    // Rerank with vector similarity
    const ftsWeight = this.opts.ftsWeight;
    const vecWeight = 1 - ftsWeight;

    const reranked: Array<{ entry: MemoryEntry; score: number }> = [];

    for (const result of ftsResults) {
      const embRow = this.db
        .prepare("SELECT vector, dim FROM memory_embeddings WHERE memory_id = ?")
        .get(result.entry.id) as EmbeddingRow | undefined;

      let hybridScore: number;

      if (embRow && queryVec.length === embRow.dim) {
        const vec  = bufferToFloat32(embRow.vector);
        const sim  = (cosineSimilarity(queryVec, vec) + 1) / 2; // normalise to [0, 1]
        hybridScore = ftsWeight * result.score + vecWeight * sim;
      } else {
        hybridScore = result.score;
      }

      reranked.push({ entry: result.entry, score: hybridScore });
    }

    reranked.sort((a, b) => b.score - a.score);

    return reranked.slice(0, maxResults).map(({ entry, score }) => ({
      entry,
      score,
      matchType: "hybrid" as const,
    }));
  }

  async read(filePath: string, opts?: ReadOptions): Promise<string> {
    const expanded = expandHome(filePath);
    let content: string;
    try {
      content = fs.readFileSync(expanded, "utf-8");
    } catch {
      throw new Error(`Cannot read file: ${filePath}`);
    }

    const lines = content.split("\n");
    const from  = Math.max(1, opts?.from ?? 1);
    const count = Math.min(opts?.lines ?? 50, 200);

    return lines
      .slice(from - 1, from - 1 + count)
      .map((line, i) => `${from + i}: ${line}`)
      .join("\n");
  }

  async list(filter?: MemoryFilter): Promise<MemoryEntry[]> {
    const where:  string[] = [];
    const params: unknown[] = [];

    const status = filter?.status ?? "active";
    where.push("status = ?");
    params.push(status);

    if (filter?.memoryTypes?.length) {
      where.push(`memory_type IN (${filter.memoryTypes.map(() => "?").join(",")})`);
      params.push(...filter.memoryTypes);
    }
    if (filter?.scope) {
      where.push("scope = ?");
      params.push(filter.scope);
    }
    if (filter?.projectId) {
      where.push("project_id = ?");
      params.push(filter.projectId);
    }
    if (filter?.collection) {
      where.push("collection = ?");
      params.push(filter.collection);
    }
    if (filter?.minConfidence !== undefined) {
      where.push("confidence >= ?");
      params.push(filter.minConfidence);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const orderBy = filter?.orderBy ?? "recent";
    const orderClause =
      orderBy === "confidence"   ? "ORDER BY confidence DESC" :
      orderBy === "accessCount"  ? "ORDER BY access_count DESC" :
                                   "ORDER BY derived_at DESC";
    const limitClause = filter?.limit ? `LIMIT ${filter.limit}` : "";

    const rows = this.db
      .prepare(`SELECT * FROM memories ${whereClause} ${orderClause} ${limitClause}`)
      .all(params) as MemoryRow[];

    return rows.map(rowToEntry);
  }

  async writeCandidate(
    candidate: MemoryCandidate,
    opts?: WriteOptions,
  ): Promise<MemoryEntry | null> {
    if (!candidateMeetsThreshold(candidate, candidate.evidenceIds.length)) {
      return null;
    }
    return this.write(
      {
        memoryType:      candidate.memoryType,
        title:           candidate.title,
        content:         candidate.content,
        confidence:      candidate.confidence,
        scope:           candidate.scope,
        sourceAuthority: candidate.sourceAuthority,
        status:          "active",
      },
      opts,
    );
  }

  async delete(id: string | number): Promise<void> {
    this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  // ── Embedding support ───────────────────────────────────────────────────────

  /**
   * Store a pre-computed embedding vector for a memory entry.
   * Called by the FileIndexer after embedding batches complete.
   */
  async storeEmbedding(id: string | number, vec: Float32Array): Promise<void> {
    const buf = float32ToBuffer(vec);
    this.db.prepare(`
      INSERT INTO memory_embeddings (memory_id, vector, dim)
      VALUES (?, ?, ?)
      ON CONFLICT(memory_id) DO UPDATE SET vector = excluded.vector, dim = excluded.dim
    `).run(id, buf, vec.length);
  }

  /**
   * Retrieve a stored embedding vector for a memory entry.
   * Returns null if not found.
   */
  getEmbedding(id: string | number): Float32Array | null {
    const row = this.db
      .prepare("SELECT vector, dim FROM memory_embeddings WHERE memory_id = ?")
      .get(id) as EmbeddingRow | undefined;
    if (!row) return null;
    return bufferToFloat32(row.vector);
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  /** Return summary statistics about the store. */
  getStats(): {
    total: number;
    active: number;
    withEmbeddings: number;
    byType: Record<string, number>;
  } {
    const total         = (this.db.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number }).c;
    const active        = (this.db.prepare("SELECT COUNT(*) as c FROM memories WHERE status = 'active'").get() as { c: number }).c;
    const withEmbeddings = (this.db.prepare("SELECT COUNT(*) as c FROM memory_embeddings").get() as { c: number }).c;

    const typeRows = this.db
      .prepare("SELECT memory_type, COUNT(*) as c FROM memories GROUP BY memory_type")
      .all() as Array<{ memory_type: string; c: number }>;

    const byType: Record<string, number> = {};
    for (const row of typeRows) byType[row.memory_type] = row.c;

    return { total, active, withEmbeddings, byType };
  }
}
