/**
 * Find files tool — find files and directories using fd.
 *
 * More flexible than glob: supports regex/literal patterns, type filtering,
 * extension filtering, depth limiting, hidden files, and exclude patterns.
 * Falls back to `find` if fd is not available.
 */
import type { ToolDefinition } from "./types.js";
export declare const findFilesToolDefinition: ToolDefinition;
export declare function findFilesTool(params: Record<string, unknown>, cwd: string): Promise<string>;
//# sourceMappingURL=find-files.d.ts.map