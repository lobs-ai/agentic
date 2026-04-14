/**
 * Edit tool — precise find-and-replace in files.
 *
 * Supports single edits (old_string/new_string) or batched edits via an
 * `edits` array for multiple changes in one call. All edits target the same file.
 * The old_string must match exactly (including whitespace).
 * Shows a unified diff of each change after a successful edit.
 */
import type { ToolDefinition } from "./types.js";
import { createReadSnapshot } from "./read.js";
export declare const editToolDefinition: ToolDefinition;
export declare function editTool(params: Record<string, unknown>, cwd: string): Promise<string>;
export { createReadSnapshot };
//# sourceMappingURL=edit.d.ts.map