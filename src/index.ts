/**
 * agentic — zero-config agent runtime.
 *
 * This is the single public entry point. It bundles the `@agentic/runtime`
 * top-level API together with the re-exports from `@agentic/llm`,
 * `@agentic/tools`, and `@agentic/runner`.
 *
 * ```ts
 * import { AgenticRuntime } from "agentic";
 * const rt = await AgenticRuntime.fromConfig();
 * ```
 */
export * from "@agentic/runtime";
