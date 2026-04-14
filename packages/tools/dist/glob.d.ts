/**
 * Glob tool — find files by glob pattern.
 *
 * Uses fd if available, falls back to the find command.
 */
import type { ToolDefinition } from "./types.js";
export declare const globToolDefinition: ToolDefinition;
export declare function globTool(params: Record<string, unknown>, cwd: string): Promise<string>;
//# sourceMappingURL=glob.d.ts.map