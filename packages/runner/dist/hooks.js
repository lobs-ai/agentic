/**
 * Hook registry — lifecycle hooks for the agent execution loop.
 *
 * Hooks let consumers observe and intercept agent execution at key points:
 * - before/after LLM calls
 * - before/after tool calls (can deny or modify tool calls)
 * - agent start/end
 * - context compaction
 * - errors
 *
 * Usage:
 * ```ts
 * const registry = getHookRegistry();
 * registry.register("before_tool_call", async (event) => {
 *   if (event.data.toolName === "exec") {
 *     // Inspect or modify the tool call
 *   }
 *   return event; // return null to deny execution
 * });
 * ```
 */
// ── Registry ──────────────────────────────────────────────────────────────────
export class HookRegistry {
    handlers = new Map();
    /** Register a handler for a hook event type. */
    register(type, handler) {
        const list = this.handlers.get(type) ?? [];
        list.push(handler);
        this.handlers.set(type, list);
    }
    /** Unregister all handlers for a hook event type. */
    unregister(type) {
        this.handlers.delete(type);
    }
    /**
     * Emit a hook event.
     *
     * Handlers are called in registration order. If any handler returns `null`,
     * the chain is broken and `null` is returned (used to deny tool execution).
     *
     * @returns The (possibly modified) event, or null if denied.
     */
    async emit(type, event) {
        const handlers = this.handlers.get(type) ?? [];
        let current = event;
        for (const handler of handlers) {
            if (current === null)
                break;
            try {
                current = await handler(current);
            }
            catch {
                // Hook errors must not crash the agent loop
                current = event;
            }
        }
        return current;
    }
    /** Clear all registered handlers. */
    clear() {
        this.handlers.clear();
    }
}
// ── Singleton ─────────────────────────────────────────────────────────────────
let _registry = null;
/**
 * Get the global hook registry.
 * Creates the registry on first call.
 */
export function getHookRegistry() {
    if (!_registry) {
        _registry = new HookRegistry();
    }
    return _registry;
}
/**
 * Reset the global hook registry (useful in tests).
 */
export function resetHookRegistry() {
    _registry = null;
}
//# sourceMappingURL=hooks.js.map