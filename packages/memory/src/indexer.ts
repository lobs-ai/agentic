/**
 * FileIndexer — indexes markdown and text files into a MemoryStore
 * as `document` chunks.
 *
 * Chunks are stored as MemoryEntry objects with memoryType='document'.
 * Embeddings are queued asynchronously and batched to avoid overwhelming
 * the embeddings endpoint.
 *
 * Usage:
 * ```ts
 * const indexer = new FileIndexer(store, {
 *   watchDirs: [{ path: '~/docs', collection: 'docs', recursive: true }],
 *   embedUrl: 'http://localhost:1234/v1/embeddings',
 *   embedModel: 'text-embedding-ada-002',
 * });
 * indexer.start();
 * // later...
 * indexer.stop();
 * ```
 */

import * as fs   from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { MemoryStore } from "./store.js";
import type { FileIndexerConfig } from "./types.js";

// ── Internal types ────────────────────────────────────────────────────────────

interface EmbeddingJob {
  memoryId: string | number;
  text:     string;
}

interface Chunk {
  title:   string | null;
  content: string;
  index:   number;
  hash:    string;
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".cache", ".next"]);

// ── FileIndexer ───────────────────────────────────────────────────────────────

export class FileIndexer {
  private readonly config: FileIndexerConfig;
  private readonly store:  MemoryStore;

  private intervalId:      ReturnType<typeof setInterval> | null = null;
  private embeddingQueue:  EmbeddingJob[] = [];
  private drainInProgress = false;
  private lastBatchAt     = 0;
  private readonly BATCH_RATE_MS = 500;

  private stats = { files: 0, chunks: 0 };

  constructor(store: MemoryStore, config: FileIndexerConfig) {
    this.store  = store;
    this.config = config;
  }

  /** Start the indexer — initial scan + periodic rescans. */
  start(): void {
    const interval = this.config.rescanIntervalMs ?? 900_000;
    void this.runScan();
    this.intervalId = setInterval(() => void this.runScan(), interval);
  }

  /** Stop the indexer and cancel pending work. */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.embeddingQueue = [];
  }

  /** Force an immediate rescan. */
  async rescan(): Promise<void> {
    await this.runScan();
  }

  /** Return indexer stats. */
  getStats(): { files: number; chunks: number; pendingEmbeddings: number } {
    return {
      files:            this.stats.files,
      chunks:           this.stats.chunks,
      pendingEmbeddings: this.embeddingQueue.length,
    };
  }

  // ── Scan logic ──────────────────────────────────────────────────────────────

  private async runScan(): Promise<void> {
    for (const dir of this.config.watchDirs) {
      try {
        const expandedPath = dir.path.replace(/^~/, process.env.HOME ?? "");
        const files = collectFiles(expandedPath, dir.recursive);
        for (const filePath of files) {
          try {
            await this.indexFile(filePath, dir.collection);
          } catch {
            // One bad file shouldn't break the whole scan
          }
        }
      } catch {
        // Directory missing or unreadable — skip
      }
    }
  }

  private async indexFile(filePath: string, collection: string): Promise<void> {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      return;
    }

    const fileHash = sha1(content);

    // Check if file is already indexed with the same hash
    const existing = await this.store.list({ collection, status: "active" });
    const alreadyIndexed = existing.some(
      (e) => e.sourcePath === filePath && e.contentHash === fileHash,
    );
    if (alreadyIndexed) return;

    // Remove stale chunks for this file
    if (this.store.delete) {
      const oldChunks = existing.filter((e) => e.sourcePath === filePath);
      for (const old of oldChunks) {
        await this.store.delete(old.id);
      }
    }

    const strategy  = this.config.chunkStrategy  ?? "heading";
    const maxTokens = this.config.maxChunkTokens ?? 400;
    const chunks    = chunkContent(content, strategy, maxTokens);
    const now       = new Date().toISOString();

    for (const chunk of chunks) {
      const entry = await this.store.write({
        memoryType:      "document",
        title:           chunk.title ?? path.basename(filePath),
        content:         chunk.content,
        confidence:      1.0,
        scope:           "system",
        sourceAuthority: 1,
        status:          "active",
        derivedAt:       now,
        accessCount:     0,
        collection,
        sourcePath:      filePath,
        chunkIndex:      chunk.index,
        contentHash:     chunk.hash,
      });

      this.embeddingQueue.push({ memoryId: entry.id, text: chunk.content });
    }

    this.stats.files++;
    this.stats.chunks += chunks.length;

    void this.drainEmbeddingQueue();
  }

  // ── Embedding queue ─────────────────────────────────────────────────────────

  private async drainEmbeddingQueue(): Promise<void> {
    if (this.drainInProgress || this.embeddingQueue.length === 0) return;
    if (!this.config.embedUrl || !this.config.embedModel) return;

    this.drainInProgress = true;
    try {
      const batchSize = this.config.batchSize ?? 10;
      while (this.embeddingQueue.length > 0) {
        const elapsed = Date.now() - this.lastBatchAt;
        if (elapsed < this.BATCH_RATE_MS) {
          await sleep(this.BATCH_RATE_MS - elapsed);
        }
        const batch = this.embeddingQueue.splice(0, batchSize);
        this.lastBatchAt = Date.now();
        await this.embedBatchWithRetry(batch, 3);
      }
    } finally {
      this.drainInProgress = false;
    }
  }

  private async embedBatchWithRetry(
    batch: EmbeddingJob[],
    maxRetries: number,
  ): Promise<void> {
    if (!this.config.embedUrl || !this.config.embedModel) return;

    const url   = this.config.embedUrl;
    const model = this.config.embedModel;
    const texts = batch.map((j) => j.text);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const resp = await fetch(url, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ model, input: texts }),
          signal:  AbortSignal.timeout(15_000),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = (await resp.json()) as {
          data?: Array<{ embedding?: number[]; index?: number }>;
        };
        if (!data.data?.length) return;

        // Delegate embedding storage to the store if it supports it
        const storeWithEmbeddings = this.store as unknown as {
          storeEmbedding?(id: string | number, vec: Float32Array): Promise<void>;
        };
        if (typeof storeWithEmbeddings.storeEmbedding === "function") {
          for (const item of data.data) {
            const idx = item.index ?? 0;
            const job = batch[idx];
            if (!job || !item.embedding) continue;
            await storeWithEmbeddings.storeEmbedding(job.memoryId, new Float32Array(item.embedding));
          }
        }
        return;
      } catch {
        if (attempt < maxRetries - 1) await sleep(500 * Math.pow(2, attempt));
      }
    }
  }
}

// ── Chunking helpers ──────────────────────────────────────────────────────────

function sha1(text: string): string {
  return crypto.createHash("sha1").update(text).digest("hex");
}

function chunkContent(
  content: string,
  strategy: "heading" | "fixed",
  maxChunkTokens: number,
): Chunk[] {
  if (strategy === "fixed" || !content.includes("\n#")) {
    return fixedChunks(content, maxChunkTokens);
  }
  return headingChunks(content, maxChunkTokens);
}

/**
 * Split markdown on ## and ### headings.
 * Oversized sections are further split at paragraph boundaries.
 */
export function headingChunks(content: string, maxChunkTokens = 400): Chunk[] {
  const MIN_CHARS = 50;
  const sections: Array<{ title: string; body: string }> = [];
  const lines = content.split("\n");

  let currentTitle = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    if (/^#{2,3}\s+/.test(line)) {
      if (currentBody.length > 0 || currentTitle) {
        sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
      }
      currentTitle = line.replace(/^#+\s+/, "").trim();
      currentBody  = [line];
    } else {
      currentBody.push(line);
    }
  }
  if (currentBody.length > 0 || currentTitle) {
    sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
  }

  if (sections.length === 0 || (sections.length === 1 && !sections[0].title)) {
    return fixedChunks(content, maxChunkTokens);
  }

  const chunks: Chunk[]    = [];
  let chunkIndex           = 0;
  const maxChunkChars      = maxChunkTokens * 4;

  for (const section of sections) {
    if (section.body.length < MIN_CHARS) continue;

    if (section.body.length <= maxChunkChars) {
      chunks.push({
        title:   section.title || null,
        content: section.body,
        index:   chunkIndex++,
        hash:    sha1(section.body),
      });
    } else {
      const paragraphs = section.body.split(/\n\n+/);
      let buffer       = "";

      for (const para of paragraphs) {
        if (buffer.length + para.length + 2 > maxChunkChars && buffer.length >= MIN_CHARS) {
          const trimmed = buffer.trim();
          chunks.push({ title: section.title || null, content: trimmed, index: chunkIndex++, hash: sha1(trimmed) });
          buffer = para;
        } else {
          buffer = buffer ? `${buffer}\n\n${para}` : para;
        }
      }
      const trimmed = buffer.trim();
      if (trimmed.length >= MIN_CHARS) {
        chunks.push({ title: section.title || null, content: trimmed, index: chunkIndex++, hash: sha1(trimmed) });
      }
    }
  }

  return chunks.length === 0 ? fixedChunks(content, maxChunkTokens) : chunks;
}

/**
 * Fixed-size chunking with 20% overlap (for non-markdown or headingless files).
 */
export function fixedChunks(content: string, maxChunkTokens = 400): Chunk[] {
  const MIN_CHARS    = 50;
  const maxChars     = maxChunkTokens * 4;
  const overlapChars = Math.floor(maxChars * 0.2);
  const chunks: Chunk[] = [];
  let start = 0, index = 0;

  while (start < content.length) {
    const end   = Math.min(start + maxChars, content.length);
    const slice = content.slice(start, end).trim();
    if (slice.length >= MIN_CHARS) {
      chunks.push({ title: null, content: slice, index: index++, hash: sha1(slice) });
    }
    if (end >= content.length) break;
    start = end - overlapChars;
  }

  return chunks;
}

// ── File collection ───────────────────────────────────────────────────────────

function collectFiles(dir: string, recursive: boolean, depth = 0): string[] {
  if (depth > 5 || !fs.existsSync(dir)) return [];
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))) {
      results.push(full);
    } else if (entry.isDirectory() && recursive) {
      results.push(...collectFiles(full, recursive, depth + 1));
    }
  }
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
