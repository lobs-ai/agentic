/**
 * Read tool — read file contents.
 *
 * Supports offset/limit for large files, binary detection.
 * Output is truncated to ~500 lines / 50KB by default.
 */
import type { ToolDefinition } from "./types.js";
export declare const readToolDefinition: ToolDefinition;
interface ReadSnapshot {
    mtime: number;
    size: number;
}
/**
 * Record that a file was read (used by write/edit to verify a recent read).
 */
export declare function createReadSnapshot(filePath: string): void;
/**
 * Returns true if the file has been read within the snapshot window.
 * Also verifies the file hasn't changed since it was last read.
 */
export declare function hasRecentlyReadFile(filePath: string): boolean;
/**
 * Update the read snapshot after a successful write (so subsequent edits are allowed).
 */
export declare function updateReadSnapshot(filePath: string): void;
/**
 * Get the read snapshot for a file (used by edit to check staleness).
 */
export declare function getReadSnapshot(filePath: string): ReadSnapshot | undefined;
export declare function readTool(params: Record<string, unknown>, cwd: string): Promise<string>;
export {};
//# sourceMappingURL=read.d.ts.map