/**
 * Ls tool — list directory contents.
 *
 * Shows type indicator (f=file, d=directory, l=symlink), size, and name.
 * Directories end with /.
 */
import type { ToolDefinition } from "./types.js";
export declare const lsToolDefinition: ToolDefinition;
export declare function lsTool(params: Record<string, unknown>, cwd: string): Promise<string>;
//# sourceMappingURL=ls.d.ts.map