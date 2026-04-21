/**
 * Read tool — read file contents.
 *
 * Supports offset/limit for large files, binary detection.
 * Output is truncated to ~500 lines / 50KB by default.
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import type { ToolDefinition } from "./types.js";
import { resolveToCwd } from "./path-utils.js";
import { BaseTool, type ToolContext } from "./base-tool.js";

// ── Tool Definition ──────────────────────────────────────────────────────────

export const readToolDefinition: ToolDefinition = {
  name: "read",
  description:
    "Reads a file from the local filesystem. Assume any user-provided path is worth checking. " +
    "Use an absolute path via file_path when possible. By default it reads from the start of the file and returns line-numbered text. " +
    "When you already know the area you need, use offset and limit for a targeted read instead of re-reading the whole file. " +
    "This tool reads files only, not directories.",
  input_schema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Absolute path to the file to read",
      },
      path: {
        type: "string",
        description: "Backward-compatible path field; file_path is preferred",
      },
      offset: {
        type: "number",
        description: "Optional 1-based line offset to start reading from",
      },
      limit: {
        type: "number",
        description: "Optional maximum number of lines to read",
      },
      full: {
        type: "boolean",
        description: "Return the entire text file without preview truncation",
      },
    },
    required: [],
  },
};

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_READ_LINES = 500;
const DEFAULT_READ_CHARS = 50_000;

// ── Read Snapshot (for write/edit validation) ───────────────────────────────

interface ReadSnapshot {
  mtime: number;
  size: number;
}

const readSnapshots = new Map<string, ReadSnapshot>();

/**
 * Record that a file was read (used by write/edit to verify a recent read).
 */
export function createReadSnapshot(filePath: string): void {
  try {
    const st = statSync(filePath);
    readSnapshots.set(filePath, { mtime: st.mtimeMs, size: st.size });
  } catch {
    // If stat fails (new file), store a zero snapshot
    readSnapshots.set(filePath, { mtime: 0, size: 0 });
  }
}

/**
 * Returns true if the file has been read within the snapshot window.
 * Also verifies the file hasn't changed since it was last read.
 */
export function hasRecentlyReadFile(filePath: string): boolean {
  const snap = readSnapshots.get(filePath);
  if (!snap) return false;

  try {
    const st = statSync(filePath);
    return snap.mtime === st.mtimeMs && snap.size === st.size;
  } catch {
    // For new files (don't exist yet), allow write
    return true;
  }
}

/**
 * Update the read snapshot after a successful write (so subsequent edits are allowed).
 */
export function updateReadSnapshot(filePath: string): void {
  createReadSnapshot(filePath);
}

/**
 * Get the read snapshot for a file (used by edit to check staleness).
 */
export function getReadSnapshot(filePath: string): ReadSnapshot | undefined {
  return readSnapshots.get(filePath);
}

// ── Tool Implementation ──────────────────────────────────────────────────────

export async function readTool(
  params: Record<string, unknown>,
  cwd: string,
): Promise<string> {
  const rawPath = (params.file_path as string) ?? (params.path as string);
  if (!rawPath) throw new Error("file_path is required");

  const filePath = resolveToCwd(rawPath, cwd);

  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stat = statSync(filePath);
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory: ${filePath}. Use ls tool instead.`);
  }

  // Binary detection
  const buffer = readFileSync(filePath);
  const isBinary = buffer.slice(0, 8000).some((b) => b === 0);
  if (isBinary) {
    createReadSnapshot(filePath);
    return `[Binary file: ${filePath} (${stat.size} bytes)]`;
  }

  const content = buffer.toString("utf-8");
  const lines = content.split("\n");

  const offset = typeof params.offset === "number" ? params.offset - 1 : 0;
  const limit =
    typeof params.limit === "number" ? params.limit : DEFAULT_READ_LINES;
  const full = params.full === true;

  const slice = lines.slice(offset, offset + limit);
  const numbered = slice
    .map((line, i) => `${String(offset + i + 1).padStart(4, " ")}  ${line}`)
    .join("\n");

  createReadSnapshot(filePath);

  if (full) return numbered;

  // Apply truncation for preview mode
  if (numbered.length <= DEFAULT_READ_CHARS) return numbered;

  const truncated = numbered.slice(0, DEFAULT_READ_CHARS);
  const lastNewline = truncated.lastIndexOf("\n");
  const safe = lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated;
  const shown = safe.split("\n").length;
  return safe + `\n\n[Truncated. Shown ${shown}/${slice.length} lines. Use offset/limit for more.]`;
}

// ── Class-based API ───────────────────────────────────────────────────────────

export class ReadTool extends BaseTool {
  readonly name = "read";
  readonly tags = ["filesystem", "readonly"] as const;
  readonly description = readToolDefinition.description;
  readonly inputSchema = readToolDefinition.input_schema as import("./base-tool.js").ToolInputSchema;

  run(params: Record<string, unknown>, ctx: ToolContext) {
    return readTool(params, ctx.cwd);
  }
}
