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
export type HookEventType = "before_agent_start" | "after_agent_end" | "before_llm_call" | "after_llm_call" | "before_tool_call" | "after_tool_call" | "on_error" | "session_compacted";
export interface HookEvent {
    agentType: string;
    taskId: string;
    data: Record<string, unknown>;
    timestamp: Date;
}
export type HookHandler = (event: HookEvent) => Promise<HookEvent | null> | HookEvent | null;
export declare class HookRegistry {
    private handlers;
    /** Register a handler for a hook event type. */
    register(type: HookEventType, handler: HookHandler): void;
    /** Unregister all handlers for a hook event type. */
    unregister(type: HookEventType): void;
    /**
     * Emit a hook event.
     *
     * Handlers are called in registration order. If any handler returns `null`,
     * the chain is broken and `null` is returned (used to deny tool execution).
     *
     * @returns The (possibly modified) event, or null if denied.
     */
    emit(type: HookEventType, event: HookEvent): Promise<HookEvent | null>;
    /** Clear all registered handlers. */
    clear(): void;
}
/**
 * Get the global hook registry.
 * Creates the registry on first call.
 */
export declare function getHookRegistry(): HookRegistry;
/**
 * Reset the global hook registry (useful in tests).
 */
export declare function resetHookRegistry(): void;
//# sourceMappingURL=hooks.d.ts.map