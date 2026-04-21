/**
 * Agent — high-level object wrapper over `runAgent`.
 *
 * Construct once, run many times. Override per-run fields in `run()`.
 *
 * @example
 * ```ts
 * import { Agent } from "@agentic/runner";
 * import { defaultRegistry } from "@agentic/tools";
 *
 * const agent = new Agent({
 *   model: "claude-sonnet-4-6",   // auto-routes to Anthropic
 *   cwd: process.cwd(),
 *   timeout: 300,
 *   toolRegistry: defaultRegistry,
 * });
 *
 * const result = await agent.run("Summarize the README.");
 * console.log(result.output);
 * ```
 *
 * Fluent builder:
 * ```ts
 * const result = await new Agent({ model: "claude-sonnet-4-6", cwd: ".", timeout: 120 })
 *   .withTools(["read", "grep"])
 *   .withSystem("You are a code reviewer.")
 *   .run("Review the last commit.");
 * ```
 */

import type { LLMClient } from "@agentic/llm";
import type { ToolRegistry } from "@agentic/tools";
import type {
  AgentSpec,
  AgentResult,
  AgentContext,
  ProgressUpdate,
  ToolExecutor,
} from "./types.js";
import type { ContextEngine } from "./context-engine.js";
import type { Session } from "./session.js";
import { runAgent } from "./agent-loop.js";

// ── Config type ───────────────────────────────────────────────────────────────

/**
 * Configuration for an `Agent` instance. All fields except `model`, `cwd`,
 * and `timeout` are optional and can be overridden per `run()` call.
 */
export interface AgentConfig {
  /** Model string — bare ID (e.g. `"claude-sonnet-4-6"`) or `"provider/id"`. */
  model: string;
  /** Working directory for file/exec tools. */
  cwd: string;
  /** Maximum wall-clock seconds per run. */
  timeout: number;
  /** Agent type label used in logging and default system prompt. */
  agent?: string;
  /** Tool names to expose (defaults to all registered tools). */
  tools?: string[];
  /** Custom system prompt. */
  systemPrompt?: string;
  /** Maximum LLM turns before forced stop. */
  maxTurns?: number;
  /** Maximum tokens per LLM response. */
  maxTokens?: number;
  /** Tool registry to use. */
  toolRegistry?: ToolRegistry;
  /** Context engine for window management. */
  contextEngine?: ContextEngine;
  /** Override the LLM client entirely. */
  clientOverride?: LLMClient;
  /** Custom tool executor. */
  toolExecutor?: ToolExecutor;
  /** Arbitrary context (IDs, notes). */
  context?: AgentContext;
  /** Progress callback. */
  onProgress?: (update: ProgressUpdate) => void;
  /**
   * Called for each text token streamed from the LLM.
   * When provided the loop uses the provider's streaming API.
   */
  onTextChunk?: (text: string) => void;
  /** Shared session for live message history access. */
  session?: Session;
}

// ── Agent class ───────────────────────────────────────────────────────────────

export class Agent {
  private cfg: AgentConfig;

  constructor(config: AgentConfig) {
    this.cfg = { ...config };
  }

  // ── Fluent builder methods ──────────────────────────────────────────────────

  /** Return a new Agent with the given model. */
  withModel(model: string): Agent {
    return new Agent({ ...this.cfg, model });
  }

  /** Return a new Agent limited to the given tool names. */
  withTools(tools: string[]): Agent {
    return new Agent({ ...this.cfg, tools });
  }

  /** Return a new Agent using the given tool registry. */
  withToolRegistry(toolRegistry: ToolRegistry): Agent {
    return new Agent({ ...this.cfg, toolRegistry });
  }

  /** Return a new Agent using the given context engine. */
  withContextEngine(contextEngine: ContextEngine): Agent {
    return new Agent({ ...this.cfg, contextEngine });
  }

  /** Return a new Agent with the given system prompt. */
  withSystem(systemPrompt: string): Agent {
    return new Agent({ ...this.cfg, systemPrompt });
  }

  /** Return a new Agent with the given working directory. */
  withCwd(cwd: string): Agent {
    return new Agent({ ...this.cfg, cwd });
  }

  /** Return a new Agent with the given LLM client. */
  withClient(clientOverride: LLMClient): Agent {
    return new Agent({ ...this.cfg, clientOverride });
  }

  /** Return a new Agent bound to a shared session (for live message history access). */
  withSession(session: Session): Agent {
    return new Agent({ ...this.cfg, session });
  }

  // ── Run ─────────────────────────────────────────────────────────────────────

  /**
   * Run the agent on the given task. Optionally override any config fields
   * for this single run without mutating the Agent instance.
   */
  async run(task: string, overrides?: Partial<AgentConfig>): Promise<AgentResult> {
    const merged = overrides ? { ...this.cfg, ...overrides } : this.cfg;
    const spec: AgentSpec = {
      task,
      agent: merged.agent ?? "agent",
      model: merged.model,
      cwd: merged.cwd,
      timeout: merged.timeout,
      tools: merged.tools ?? [],
      systemPrompt: merged.systemPrompt,
      maxTurns: merged.maxTurns,
      maxTokens: merged.maxTokens,
      toolRegistry: merged.toolRegistry,
      contextEngine: merged.contextEngine,
      clientOverride: merged.clientOverride,
      toolExecutor: merged.toolExecutor,
      context: merged.context,
      onProgress: merged.onProgress,
      onTextChunk: merged.onTextChunk,
      session: merged.session,
    };
    return runAgent(spec);
  }
}
