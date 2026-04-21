/**
 * Write tool — write content to a file.
 *
 * Creates the file if it doesn't exist, overwrites if it does.
 * Automatically creates parent directories.
 */

import { existsSync, statSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { BaseTool, type ToolContext } from "./base-tool.js";
import type { ToolDefinition } from "./types.js";
import { resolveToCwd } from "./path-utils.js";
import { hasRecentlyReadFile, updateReadSnapshot } from "./read.js";

// ── Tool Definition ──────────────────────────────────────────────────────────

export const writeToolDefinition: ToolDefinition = {
  name: "write",
  description:
    "Writes a file to the local filesystem. This overwrites the target file if it already exists. " +
    "Prefer Edit for modifying existing files; use Write for new files, generated files, or full rewrites where replacing the whole file is intentional.",
  input_schema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Absolute path to the file to write",
      },
      path: {
        type: "string",
        description: "Backward-compatible path field; file_path is preferred",
      },
      content: {
        type: "string",
        description: "Content to write to the file",
      },
    },
    required: ["content"],
  },
};

// ── Tool Implementation ──────────────────────────────────────────────────────

export async function writeTool(
  params: Record<string, unknown>,
  cwd: string,
): Promise<string> {
  const filePath = (params.path as string) ?? (params.file_path as string);
  if (!filePath) throw new Error("path is required");

  const resolved = resolveToCwd(filePath, cwd);

  // Check if existing file was recently read (validation guard)
  if (existsSync(resolved)) {
    const stat = statSync(resolved);
    if (stat.isDirectory()) {
      throw new Error(`Path is a directory: ${resolved}`);
    }
    if (!hasRecentlyReadFile(resolved)) {
      // Allow write anyway but warn
      console.warn(`[write] Writing ${resolved} without a recent read snapshot`);
    }
  }

  const content = (params.content as string) ?? "";
  const dir = dirname(resolved);
  await mkdir(dir, { recursive: true });
  await writeFile(resolved, content, "utf-8");

  updateReadSnapshot(resolved);

  return `File written: ${resolved} (${content.length} chars)`;
}

// ── Class-based API ───────────────────────────────────────────────────────────

export class WriteTool extends BaseTool {
  readonly name = "write";
  readonly description = writeToolDefinition.description;
  readonly inputSchema = writeToolDefinition.input_schema as import("./base-tool.js").ToolInputSchema;

  run(params: Record<string, unknown>, ctx: ToolContext) {
    return writeTool(params, ctx.cwd);
  }
}
