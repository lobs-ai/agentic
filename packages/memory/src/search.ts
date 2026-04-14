/**
 * Search utilities for @agentic/memory.
 *
 * Provides:
 * - cosineSimilarity   — vector comparison
 * - keywordSearch      — in-memory keyword fallback
 * - fetchEmbedding     — OpenAI-compatible embedding fetch
 * - grepFiles          — file-system grep fallback
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { MemoryEntry, SearchResult, SearchOptions } from "./types.js";
import { MEMORY_TYPE_WEIGHTS, decayedConfidence, importanceScore } from "./store.js";

// ── Vector math ───────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two float arrays. Returns –1 to 1.
 * Returns 0 for mismatched or empty arrays.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Embedding fetch ───────────────────────────────────────────────────────────

/**
 * Fetch a query embedding from an OpenAI-compatible embeddings endpoint.
 * Returns null if the endpoint is unavailable or times out.
 *
 * @param query      Text to embed
 * @param url        Embeddings API URL (e.g. 'http://localhost:1234/v1/embeddings')
 * @param model      Model name (e.g. 'text-embedding-ada-002')
 * @param timeoutMs  Request timeout in ms. Default: 3000.
 */
export async function fetchEmbedding(
  query: string,
  url: string,
  model: string,
  timeoutMs = 3_000,
): Promise<Float32Array | null> {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: query }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { data?: Array<{ embedding?: number[] }> };
    const raw = data.data?.[0]?.embedding;
    if (!raw || !Array.isArray(raw)) return null;
    return new Float32Array(raw);
  } catch {
    return null;
  }
}

// ── Keyword search ─────────────────────────────────────────────────────────────

/**
 * Simple keyword search over an in-memory array of MemoryEntry objects.
 *
 * Score = fraction of query terms found in content + title, weighted by type.
 * Useful as a fallback when no FTS or vector index is available.
 *
 * @param query    Natural-language query
 * @param entries  Entries to search
 * @param opts     Standard search options
 */
export function keywordSearch(
  query: string,
  entries: MemoryEntry[],
  opts: SearchOptions = {},
): SearchResult[] {
  const maxResults    = opts.maxResults    ?? 10;
  const minConfidence = opts.minConfidence ?? 0.3;

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (terms.length === 0) return [];

  const scored: Array<{ entry: MemoryEntry; score: number }> = [];

  for (const entry of entries) {
    if (entry.confidence < minConfidence) continue;
    if (!opts.includeSuperseded && entry.status !== "active") continue;
    if (opts.memoryTypes && !opts.memoryTypes.includes(entry.memoryType)) continue;
    if (opts.scope && entry.scope !== opts.scope) continue;
    if (opts.projectId && entry.projectId !== opts.projectId) continue;
    if (opts.includeDocuments === false && entry.memoryType === "document") continue;
    if (opts.collections && entry.collection && !opts.collections.includes(entry.collection)) continue;

    const haystack = `${entry.title} ${entry.content}`.toLowerCase();
    const matchCount = terms.filter((t) => haystack.includes(t)).length;
    if (matchCount === 0) continue;

    const termScore  = matchCount / terms.length;
    const typeWeight = MEMORY_TYPE_WEIGHTS[entry.memoryType] ?? 1.0;
    const importance = importanceScore(entry);
    const confDecay  = decayedConfidence(entry);

    const score = Math.min(
      (termScore * 0.72 + importance * 0.18 + confDecay * 0.1) * typeWeight,
      1,
    );
    scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map(({ entry, score }) => ({
    entry,
    score,
    matchType: "keyword" as const,
  }));
}

// ── File grep fallback ────────────────────────────────────────────────────────

export interface GrepResult {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
}

/**
 * Grep-based search over markdown files in a set of directories.
 * Useful as a final fallback when no structured store is available.
 *
 * @param query       Natural-language query
 * @param searchDirs  Directories to search (recursively, up to depth 4)
 * @param maxResults  Max results to return
 */
export function grepFiles(
  query: string,
  searchDirs: string[],
  maxResults = 10,
): GrepResult[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (terms.length === 0) return [];

  const results: Array<GrepResult & { matchCount: number }> = [];

  for (const dir of searchDirs) {
    walkDir(dir, (filePath) => {
      if (!filePath.endsWith(".md") && !filePath.endsWith(".txt")) return;
      try {
        const content = readFileSync(filePath, "utf-8");
        const lines   = content.split("\n");

        for (let i = 0; i < lines.length; i += 8) {
          const chunk      = lines.slice(i, i + 12).join("\n").toLowerCase();
          const matchCount = terms.filter((t) => chunk.includes(t)).length;
          if (matchCount >= Math.min(2, terms.length)) {
            results.push({
              path:       filePath,
              startLine:  i + 1,
              endLine:    Math.min(i + 12, lines.length),
              score:      matchCount / terms.length,
              snippet:    lines.slice(i, i + 8).join("\n"),
              matchCount,
            });
          }
        }
      } catch {
        /* skip unreadable files */
      }
    });
  }

  results.sort((a, b) => b.matchCount - a.matchCount);
  return results.slice(0, maxResults);
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".cache", ".next"]);

function walkDir(dir: string, cb: (path: string) => void, depth = 0): void {
  if (depth > 4) return;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith(".") || SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) walkDir(full, cb, depth + 1);
        else if (stat.isFile()) cb(full);
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
}
