/**
 * Grep tool — search file contents using ripgrep.
 *
 * Uses ripgrep (rg) for fast searching that respects .gitignore.
 * Falls back to grep -rn if rg is not available.
 */
import type { ToolDefinition } from "./types.js";
export declare const grepToolDefinition: ToolDefinition;
export declare function grepTool(params: Record<string, unknown>, cwd: string): Promise<string>;
//# sourceMappingURL=grep.d.ts.map