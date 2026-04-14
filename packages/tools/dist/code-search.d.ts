/**
 * Code search tool — smart code search using ripgrep with context.
 *
 * Wraps ripgrep with useful defaults for code navigation: surrounding context
 * lines, language filtering, smart case, word matching, and result capping.
 */
import type { ToolDefinition } from "./types.js";
export declare const codeSearchToolDefinition: ToolDefinition;
export declare function codeSearchTool(params: Record<string, unknown>, cwd: string): Promise<string>;
//# sourceMappingURL=code-search.d.ts.map