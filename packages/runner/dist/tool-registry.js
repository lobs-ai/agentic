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
// ── Registry ──────────────────────────────────────────────────────────────────
const tools = new Map();
/**
 * Register a tool implementation.
 */
export function registerTool(name, entry) {
    tools.set(name, entry);
}
/**
 * Get tool definitions for the given tool names (or all registered tools).
 */
export function getToolDefinitions(names) {
    if (!names || names.length === 0) {
        return Array.from(tools.values()).map((t) => t.definition);
    }
    const defs = [];
    for (const name of names) {
        const entry = tools.get(name);
        if (entry)
            defs.push(entry.definition);
    }
    return defs;
}
/**
 * Execute a tool by name.
 *
 * Returns a ToolResult. Errors are captured and returned as error results
 * rather than thrown, so the agent loop can handle them gracefully.
 */
export async function executeTool(name, params, toolUseId, cwd) {
    const entry = tools.get(name);
    if (!entry) {
        return {
            toolUseId,
            content: `Unknown tool: ${name}`,
            is_error: true,
        };
    }
    try {
        const result = await entry.execute(params, cwd);
        return {
            toolUseId,
            content: result.output,
            is_error: result.isError ?? false,
        };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            toolUseId,
            content: `Tool ${name} threw an error: ${msg}`,
            is_error: true,
        };
    }
}
//# sourceMappingURL=tool-registry.js.map