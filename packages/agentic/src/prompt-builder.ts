/**
 * PromptBuilder — fluent, composable system prompt construction.
 *
 * Replaces ad-hoc string concatenation with a structured builder that
 * renders predictable, readable prompts.
 *
 * @example
 * ```ts
 * const prompt = new PromptBuilder()
 *   .role("You are a code review assistant.")
 *   .rules([
 *     "Always explain the why, not just the what.",
 *     "Prefer small, focused suggestions.",
 *   ])
 *   .context({ repo: "agentic", pr: 42, author: "rafe" })
 *   .section("Guidelines", "Follow the project's existing patterns.")
 *   .build();
 * ```
 *
 * @example Multi-section prompt with examples
 * ```ts
 * const prompt = new PromptBuilder()
 *   .role("Extract structured data from the provided text.")
 *   .section("Output format", "Respond only with valid JSON.")
 *   .examples([
 *     { input: "John Smith, age 30", output: '{ "name": "John Smith", "age": 30 }' },
 *   ])
 *   .build();
 * ```
 */

export class PromptBuilder {
  private readonly _parts: string[] = [];

  // ── Core methods ─────────────────────────────────────────────────────────────

  /**
   * Set the agent's core role / persona. Rendered first, with no header.
   *
   * Usually one or two sentences describing what the agent is.
   *
   * @example `builder.role("You are a senior TypeScript engineer.")`
   */
  role(description: string): this {
    this._parts.unshift(description.trim());
    return this;
  }

  /**
   * Add a named section with a `## Title` heading.
   *
   * @param title   Section title (rendered as a Markdown `##` heading).
   * @param content Either a string body or an array of lines.
   */
  section(title: string, content: string | string[]): this {
    const body = Array.isArray(content) ? content.join("\n") : content;
    this._parts.push(`## ${title}\n${body.trim()}`);
    return this;
  }

  /**
   * Add a "Rules" section as a bulleted list.
   *
   * @example
   * ```ts
   * builder.rules([
   *   "Read files before editing them.",
   *   "When in doubt, ask for clarification.",
   * ]);
   * ```
   */
  rules(items: string[]): this {
    return this.section("Rules", items.map((r) => `- ${r}`));
  }

  /**
   * Inject a structured context object as a fenced `<context>` block.
   *
   * Useful for passing user metadata, application state, or runtime config
   * to the model in a consistent, parseable format.
   *
   * @example
   * ```ts
   * builder.context({ userId: "u_123", role: "admin", plan: "pro" });
   * ```
   */
  context(data: Record<string, unknown>): this {
    this._parts.push(
      `<context>\n${JSON.stringify(data, null, 2)}\n</context>`,
    );
    return this;
  }

  /**
   * Add a fenced block with an explicit tag (e.g. `<task>`, `<guidelines>`).
   *
   * @example
   * ```ts
   * builder.block("task", "Summarize the changes in the last 5 commits.");
   * ```
   */
  block(tag: string, content: string): this {
    this._parts.push(`<${tag}>\n${content.trim()}\n</${tag}>`);
    return this;
  }

  /**
   * Add an "Examples" section showing input → output pairs.
   *
   * @example
   * ```ts
   * builder.examples([
   *   { input: "summarize this paragraph", output: "One sentence summary." },
   * ]);
   * ```
   */
  examples(items: Array<{ input: string; output: string }>): this {
    const body = items
      .map((e, i) => `### Example ${i + 1}\nInput: ${e.input}\nOutput: ${e.output}`)
      .join("\n\n");
    return this.section("Examples", body);
  }

  /**
   * Append raw text without any formatting.
   * Useful for including pre-formatted content verbatim.
   */
  raw(text: string): this {
    this._parts.push(text.trim());
    return this;
  }

  // ── Output ────────────────────────────────────────────────────────────────────

  /** Build the final prompt string. Parts are joined with blank lines. */
  build(): string {
    return this._parts.join("\n\n");
  }

  /** Alias for `build()` — lets the builder be used directly as a string. */
  toString(): string {
    return this.build();
  }

  // ── Static factory ────────────────────────────────────────────────────────────

  /**
   * Create a builder from an existing string, adding it as the initial raw content.
   * Useful when migrating from inline strings.
   */
  static from(base: string): PromptBuilder {
    return new PromptBuilder().raw(base);
  }
}
