/**
 * Exec tool — run shell commands.
 *
 * Supports cmd, workdir, timeout, env, and run_in_background.
 * Detects cwd changes via a sentinel marker so the agent runner
 * can update its tracked working directory.
 */
import type { ToolDefinition, ToolExecutorResult } from "./types.js";
export declare const execToolDefinition: ToolDefinition;
export declare function execTool(params: Record<string, unknown>, defaultCwd: string): Promise<ToolExecutorResult>;
//# sourceMappingURL=exec.d.ts.map