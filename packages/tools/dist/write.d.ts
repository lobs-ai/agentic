/**
 * Write tool — write content to a file.
 *
 * Creates the file if it doesn't exist, overwrites if it does.
 * Automatically creates parent directories.
 */
import type { ToolDefinition } from "./types.js";
export declare const writeToolDefinition: ToolDefinition;
export declare function writeTool(params: Record<string, unknown>, cwd: string): Promise<string>;
//# sourceMappingURL=write.d.ts.map