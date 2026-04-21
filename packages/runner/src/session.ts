/**
 * Session — shared message history for an agent run.
 *
 * Create a Session before starting an agent to get a live view of the
 * conversation as it progresses. Pass it to `Agent.withSession()` and
 * the loop will read and write through it instead of a private array.
 *
 * The application and the loop share the *same* underlying array, so
 * `session.messages` always reflects the live state — no polling needed.
 *
 * @example
 * ```ts
 * const session = new Session();
 *
 * const result = await runtime.agent({ model: "claude-sonnet-4-6" })
 *   .withSession(session)
 *   .run("Summarize the codebase.");
 *
 * // Read messages at any point during or after the run
 * console.log(session.messages.length, "messages");
 * ```
 *
 * @example Resume a previous run
 * ```ts
 * const session = new Session(previousMessages);
 * await runtime.agent({ model: "claude-sonnet-4-6" })
 *   .withSession(session)
 *   .run("Continue from where you left off.");
 * ```
 */

import type { LLMMessage } from "@agentic/llm";

export class Session {
  private readonly _messages: LLMMessage[];

  /**
   * @param initialMessages Pre-seed the session (e.g. to resume a previous run).
   */
  constructor(initialMessages: LLMMessage[] = []) {
    this._messages = initialMessages;
  }

  // ── Application API ───────────────────────────────────────────────────────

  /** Live read-only view of the current message history. */
  get messages(): readonly LLMMessage[] {
    return this._messages;
  }

  /**
   * Replace the message history in-place.
   *
   * Safe to call while a run is active — the loop will see the new messages
   * on its next turn. Use with care; you're responsible for keeping the
   * tool_use ↔ tool_result pairing intact.
   */
  seed(messages: LLMMessage[]): this {
    this._messages.length = 0;
    this._messages.push(...messages);
    return this;
  }

  /**
   * Return an independent copy of this session.
   * Useful for branching: run a speculative path without affecting the original.
   */
  fork(): Session {
    return new Session([...this._messages]);
  }

  // ── Internal: used by the agent loop only ────────────────────────────────

  /**
   * @internal Direct mutable reference — only the loop should use this.
   *
   * Returns the same array the session wraps. All push/splice mutations
   * made by the loop are automatically visible through `session.messages`.
   */
  _ref(): LLMMessage[] {
    return this._messages;
  }
}
