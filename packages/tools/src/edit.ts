/**
 * Edit tool — precise find-and-replace in files.
 *
 * Supports single edits (old_string/new_string) or batched edits via an
 * `edits` array for multiple changes in one call. All edits target the same file.
 * The old_string must match exactly (including whitespace).
 * Shows a unified diff of each change after a successful edit.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import type { ToolDefinition } from "./types.js";
import { resolveToCwd } from "./path-utils.js";
import { hasRecentlyReadFile, getReadSnapshot, createReadSnapshot, updateReadSnapshot } from "./read.js";

// ── Tool Definition ──────────────────────────────────────────────────────────

export const editToolDefinition: ToolDefinition = {
  name: "edit",
  description:
    "Performs exact string replacements in files. You must use Read on the file before editing it. " +
    "Preserve exact indentation and whitespace exactly as it appears in the file, excluding any line-number prefix from Read output. " +
    "Use the smallest clearly unique old_string you can, usually only a few adjacent lines. " +
    "The edit fails if old_string is ambiguous; provide more context or use replace_all when you intentionally want every instance updated.",
  input_schema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Absolute path to the file to edit",
      },
      path: {
        type: "string",
        description: "Backward-compatible path field; file_path is preferred",
      },
      old_string: {
        type: "string",
        description: "Exact text to find and replace (must match exactly)",
      },
      new_string: {
        type: "string",
        description: "Replacement text",
      },
      replace_all: {
        type: "boolean",
        description: "Replace all occurrences instead of enforcing uniqueness (default: false)",
      },
      edits: {
        type: "array",
        description: "Batch of edits to apply in sequence (alternative to old_string/new_string)",
        items: {
          type: "object",
          properties: {
            old_string: { type: "string" },
            new_string: { type: "string" },
            replace_all: { type: "boolean" },
          },
          required: ["old_string", "new_string"],
        },
      },
    },
    required: [],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute a minimal unified diff between two strings.
 */
function computeDiff(before: string, after: string, filePath: string): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");

  const diff: string[] = [`--- ${filePath}`, `+++ ${filePath}`];
  const maxLen = Math.max(beforeLines.length, afterLines.length);

  let i = 0;
  while (i < maxLen) {
    const bLine = beforeLines[i] ?? "";
    const aLine = afterLines[i] ?? "";
    if (bLine !== aLine) {
      let j = i;
      while (j < maxLen && (beforeLines[j] ?? "") !== (afterLines[j] ?? "")) j++;
      diff.push(`@@ -${i + 1},${j - i} +${i + 1},${j - i} @@`);
      for (let k = i; k < j; k++) {
        if (k < beforeLines.length) diff.push(`-${beforeLines[k]}`);
        if (k < afterLines.length) diff.push(`+${afterLines[k]}`);
      }
      i = j;
    } else {
      i++;
    }
  }

  return diff.join("\n");
}

// ── Single Edit ──────────────────────────────────────────────────────────────

interface EditOp {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

function applyEdit(content: string, op: EditOp): { result: string; count: number } {
  const { old_string, new_string, replace_all } = op;

  if (!old_string) {
    throw new Error("old_string is required");
  }

  const count = countOccurrences(content, old_string);

  if (count === 0) {
    throw new Error(`old_string not found in file:\n${old_string}`);
  }

  if (!replace_all && count > 1) {
    throw new Error(
      `old_string is ambiguous — found ${count} occurrences. ` +
      `Add more context to make it unique, or set replace_all=true to replace all.`
    );
  }

  const result = replace_all
    ? content.split(old_string).join(new_string)
    : content.replace(old_string, new_string);

  return { result, count };
}

function countOccurrences(str: string, sub: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = str.indexOf(sub, pos)) !== -1) {
    count++;
    pos += sub.length;
  }
  return count;
}

// ── Tool Implementation ──────────────────────────────────────────────────────

export async function editTool(
  params: Record<string, unknown>,
  cwd: string,
): Promise<string> {
  const rawPath = (params.file_path as string) ?? (params.path as string);
  if (!rawPath) throw new Error("file_path is required");

  const filePath = resolveToCwd(rawPath, cwd);

  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}. Use write tool to create new files.`);
  }

  const stat = statSync(filePath);
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory: ${filePath}`);
  }

  // Check that file was recently read
  if (!hasRecentlyReadFile(filePath)) {
    const snap = getReadSnapshot(filePath);
    if (!snap) {
      throw new Error(`You must read the file before editing it. Use the Read tool first.`);
    }
    try {
      const current = statSync(filePath);
      if (snap.mtime !== current.mtimeMs) {
        throw new Error(`File has changed since last read. Please re-read it before editing.`);
      }
    } catch {
      throw new Error(`You must read the file before editing it. Use the Read tool first.`);
    }
  }

  const content = readFileSync(filePath, "utf-8");

  // Collect edits
  let ops: EditOp[];
  if (Array.isArray(params.edits)) {
    ops = params.edits as EditOp[];
  } else if (params.old_string !== undefined) {
    ops = [{
      old_string: params.old_string as string,
      new_string: (params.new_string as string) ?? "",
      replace_all: params.replace_all as boolean | undefined,
    }];
  } else {
    throw new Error("Provide old_string/new_string or an edits array");
  }

  // Apply all edits
  let current = content;
  const diffs: string[] = [];
  let totalEdits = 0;

  for (const op of ops) {
    const before = current;
    const { result, count } = applyEdit(current, op);
    current = result;
    totalEdits += count;
    diffs.push(computeDiff(before, result, filePath));
  }

  writeFileSync(filePath, current, "utf-8");
  updateReadSnapshot(filePath);

  const summary = ops.length === 1
    ? `Edited ${filePath} (${totalEdits} replacement${totalEdits > 1 ? "s" : ""})`
    : `Edited ${filePath} (${ops.length} edits, ${totalEdits} total replacements)`;

  return `${summary}\n\n${diffs.join("\n\n")}`;
}

// Re-export snapshot helpers (needed by write.ts)
export { createReadSnapshot };
