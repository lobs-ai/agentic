/**
 * Tool registry — maps tool names to definitions and executors.
 *
 * This is a minimal registry that delegates to the @agentic/tools package
 * when available, or falls back to a no-op. It provides the seam between
 * the runner loop and any tool implementation layer.
 *
 * In production lobs-core usage the toolExecutor field on AgentSpec is
 * used instead, so this registry serves as the default fallback.
 */
import type { ToolDefinition } from "@agentic/llm";
import type { ToolResult } from "./types.js";
export interface ToolEntry {
    definition: ToolDefinition;
    execute: (params: Record<string, unknown>, cwd: string) => Promise<{
        output: string;
        isError?: boolean;
    }>;
}
/**
 * Register a tool implementation.
 */
export declare function registerTool(name: string, entry: ToolEntry): void;
/**
 * Get tool definitions for the given tool names (or all registered tools).
 */
export declare function getToolDefinitions(names?: string[]): ToolDefinition[];
/**
 * Execute a tool by name.
 *
 * Returns a ToolResult. Errors are captured and returned as error results
 * rather than thrown, so the agent loop can handle them gracefully.
 */
export declare function executeTool(name: string, params: Record<string, unknown>, toolUseId: string, cwd: string): Promise<ToolResult>;
//# sourceMappingURL=tool-registry.d.ts.map