/**
 * FileMemoryStore — a simple file-based MemoryStore implementation.
 *
 * Stores memories as a single JSON file (entries.json) alongside a
 * directory of markdown files. The markdown files are what humans actually
 * read; the JSON is the queryable index.
 *
 * Layout:
 * ```
 * <rootDir>/
 *   entries.json           — all MemoryEntry objects as a JSON array
 *   daily/
 *     2026-04-14.md        — entries written today (human-readable)
 *   permanent/
 *     learnings.md
 *     decisions.md
 *     facts.md
 * ```
 *
 * Search is keyword-only (no FTS, no vectors). For richer search, use SqliteMemoryStore.
 *
 * Usage:
 * ```ts
 * import { FileMemoryStore } from '@agentic/memory';
 *
 * const store = new FileMemoryStore('~/my-agent-memory');
 * await store.write({ memoryType: 'learning', title: 'Rate limit workaround', ... });
 * const results = await store.search('rate limit');
 * ```
 */

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
} from "./types.js";
import type { MemoryStore, MemoryWriteInput } from "./store.js";
import { candidateMeetsThreshold } from "./store.js";
import { keywordSearch } from "./search.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function expandHome(p: string): string {
  return p.replace(/^~/, process.env.HOME ?? "");
}

function sha1(text: string): string {
  return crypto.createHash("sha1").update(text).digest("hex");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMarkdownEntry(entry: MemoryEntry): string {
  const badge = `[${entry.memoryType}]`;
  const conf  = `confidence ${(entry.confidence * 100).toFixed(0)}%`;
  const ts    = entry.derivedAt.slice(0, 10);
  return `## ${entry.title}\n\n${entry.content}\n\n*${badge} ${conf} — ${ts}*\n`;
}

// ── FileMemoryStore ────────────────────────────────────────────────────────────

/**
 * Options for constructing a FileMemoryStore.
 */
export interface FileMemoryStoreOptions {
  /**
   * Whether to write human-readable markdown files alongside entries.json.
   * @default true
   */
  writeMarkdown?: boolean;
  /**
   * Whether to append entries to daily markdown files.
   * @default true
   */
  writeDailyFiles?: boolean;
}

export class FileMemoryStore implements MemoryStore {
  private readonly rootDir: string;
  private readonly opts:    Required<FileMemoryStoreOptions>;

  private entries:    Map<string | number, MemoryEntry> = new Map();
  private nextId      = 1;
  private dirty       = false;

  constructor(rootDir: string, opts: FileMemoryStoreOptions = {}) {
    this.rootDir = expandHome(rootDir);
    this.opts = {
      writeMarkdown:   opts.writeMarkdown   ?? true,
      writeDailyFiles: opts.writeDailyFiles ?? true,
    };
    this.ensureDirs();
    this.load();
  }

  // ── MemoryStore interface ───────────────────────────────────────────────────

  async write(input: MemoryWriteInput, _opts?: WriteOptions): Promise<MemoryEntry> {
    const now = new Date().toISOString();

    let entry: MemoryEntry;

    if (input.id !== undefined && this.entries.has(input.id)) {
      // Update existing
      const existing = this.entries.get(input.id)!;
      entry = {
        ...existing,
        ...input,
        id:          existing.id,
        accessCount: existing.accessCount,
        derivedAt:   existing.derivedAt,
      };
    } else {
      // New entry
      const id = input.id ?? this.nextId++;
      entry = {
        id,
        memoryType:      input.memoryType,
        title:           input.title,
        content:         input.content,
        confidence:      input.confidence,
        scope:           input.scope,
        sourceAuthority: input.sourceAuthority,
        status:          input.status       ?? "active",
        derivedAt:       input.derivedAt    ?? now,
        accessCount:     input.accessCount  ?? 0,
        collection:      input.collection,
        projectId:       input.projectId,
        sourcePath:      input.sourcePath,
        chunkIndex:      input.chunkIndex,
        contentHash:     input.contentHash  ?? sha1(input.content),
        lastAccessed:    input.lastAccessed,
        lastValidated:   input.lastValidated,
      };
    }

    this.entries.set(entry.id, entry);
    this.dirty = true;
    this.flush();

    if (this.opts.writeMarkdown && entry.memoryType !== "document") {
      this.appendMarkdown(entry);
    }

    return entry;
  }

  async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
    const all = Array.from(this.entries.values());
    return keywordSearch(query, all, opts);
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
    let results = Array.from(this.entries.values());

    if (filter?.status) {
      results = results.filter((e) => e.status === filter.status);
    } else if (!filter?.status) {
      // Default to active
      results = results.filter((e) => e.status === "active");
    }
    if (filter?.memoryTypes) {
      results = results.filter((e) => filter.memoryTypes!.includes(e.memoryType));
    }
    if (filter?.scope) {
      results = results.filter((e) => e.scope === filter.scope);
    }
    if (filter?.projectId) {
      results = results.filter((e) => e.projectId === filter.projectId);
    }
    if (filter?.collection) {
      results = results.filter((e) => e.collection === filter.collection);
    }
    if (filter?.minConfidence !== undefined) {
      results = results.filter((e) => e.confidence >= filter.minConfidence!);
    }

    // Sort
    const orderBy = filter?.orderBy ?? "recent";
    if (orderBy === "confidence") {
      results.sort((a, b) => b.confidence - a.confidence);
    } else if (orderBy === "accessCount") {
      results.sort((a, b) => b.accessCount - a.accessCount);
    } else {
      results.sort(
        (a, b) => new Date(b.derivedAt).getTime() - new Date(a.derivedAt).getTime(),
      );
    }

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
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
    if (this.entries.has(id)) {
      this.entries.delete(id);
      this.dirty = true;
      this.flush();
    }
  }

  async close(): Promise<void> {
    this.flush();
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  private entriesPath(): string {
    return path.join(this.rootDir, "entries.json");
  }

  private load(): void {
    const p = this.entriesPath();
    if (!fs.existsSync(p)) return;
    try {
      const data = JSON.parse(fs.readFileSync(p, "utf-8")) as {
        nextId?: number;
        entries?: MemoryEntry[];
      };
      for (const entry of data.entries ?? []) {
        this.entries.set(entry.id, entry);
      }
      if (data.nextId) this.nextId = data.nextId;
    } catch {
      /* corrupted — start fresh */
    }
  }

  private flush(): void {
    if (!this.dirty) return;
    const data = {
      nextId:  this.nextId,
      entries: Array.from(this.entries.values()),
    };
    fs.writeFileSync(this.entriesPath(), JSON.stringify(data, null, 2), "utf-8");
    this.dirty = false;
  }

  // ── Markdown output ─────────────────────────────────────────────────────────

  private appendMarkdown(entry: MemoryEntry): void {
    const markdown = formatMarkdownEntry(entry);

    if (this.opts.writeDailyFiles) {
      const dailyPath = path.join(this.rootDir, "daily", `${today()}.md`);
      fs.appendFileSync(dailyPath, `\n${markdown}\n`);
    }

    // Also append to permanent type file
    const typeFile = path.join(this.rootDir, "permanent", `${entry.memoryType}s.md`);
    if (entry.status === "active") {
      fs.appendFileSync(typeFile, `\n${markdown}\n`);
    }
  }

  private ensureDirs(): void {
    fs.mkdirSync(path.join(this.rootDir, "daily"),     { recursive: true });
    fs.mkdirSync(path.join(this.rootDir, "permanent"), { recursive: true });
  }

  // ── Convenience ─────────────────────────────────────────────────────────────

  /** Return the root directory path. */
  getRootDir(): string {
    return this.rootDir;
  }

  /** Return all entries as an array (for debugging / export). */
  getAllEntries(): MemoryEntry[] {
    return Array.from(this.entries.values());
  }
}
