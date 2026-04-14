/**
 * @agentic/runner — core types
 *
 * All public-facing interfaces for the agent execution loop.
 */
// ── Model Costs ───────────────────────────────────────────────────────────────
/** Per-million-token costs for known models. */
export const MODEL_COSTS = {
    // Anthropic
    "claude-opus-4-20250514": { inputPerM: 15.0, outputPerM: 75.0 },
    "claude-opus-4-5": { inputPerM: 15.0, outputPerM: 75.0 },
    "claude-sonnet-4-20250514": { inputPerM: 3.0, outputPerM: 15.0 },
    "claude-sonnet-4-5": { inputPerM: 3.0, outputPerM: 15.0 },
    "claude-haiku-4-5-20251014": { inputPerM: 0.8, outputPerM: 4.0 },
    "claude-3-5-haiku-20241022": { inputPerM: 0.8, outputPerM: 4.0 },
    "claude-3-5-sonnet-20241022": { inputPerM: 3.0, outputPerM: 15.0 },
    "claude-3-7-sonnet-20250219": { inputPerM: 3.0, outputPerM: 15.0 },
    // OpenAI
    "gpt-4o": { inputPerM: 2.5, outputPerM: 10.0 },
    "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6 },
    "o1": { inputPerM: 15.0, outputPerM: 60.0 },
    "o3-mini": { inputPerM: 1.1, outputPerM: 4.4 },
    // Google
    "gemini-2.0-flash": { inputPerM: 0.1, outputPerM: 0.4 },
    "gemini-1.5-pro": { inputPerM: 1.25, outputPerM: 5.0 },
};
//# sourceMappingURL=types.js.map