/**
 * Structured output utilities.
 *
 * Both `parseJsonOutput` (extraction from raw LLM text) and `extract`
 * (a full round-trip that retries until valid JSON is returned) address
 * the most common pain point when building LLM pipelines: reliably getting
 * structured data out of a model response.
 */

import { parseModelString } from "@agentic/llm";
import type { LLMClient } from "@agentic/llm";

// ── JSON extraction ───────────────────────────────────────────────────────────

/**
 * Extract a JSON value from raw LLM output.
 *
 * Handles the common cases:
 * - Bare JSON
 * - Markdown-fenced JSON  (` ```json … ``` ` or ` ``` … ``` `)
 * - JSON embedded in surrounding prose (finds the first `{…}` or `[…]`)
 *
 * @throws `SyntaxError` when no valid JSON is found.
 *
 * @example
 * ```ts
 * const data = parseJsonOutput('```json\n{"name":"Alice"}\n```');
 * // → { name: "Alice" }
 * ```
 */
export function parseJsonOutput(text: string): unknown {
  // Strip markdown code fences
  const stripped = text
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  // Fast path: entire (stripped) response is valid JSON
  try {
    return JSON.parse(stripped);
  } catch {
    // fall through
  }

  // Slow path: find the first JSON object or array in the text
  const objMatch = stripped.match(/\{[\s\S]*\}/);
  const arrMatch = stripped.match(/\[[\s\S]*\]/);
  // Prefer whichever starts first in the string
  const objIdx = objMatch ? stripped.indexOf(objMatch[0]) : Infinity;
  const arrIdx = arrMatch ? stripped.indexOf(arrMatch[0]) : Infinity;
  const candidate = objIdx <= arrIdx ? objMatch?.[0] : arrMatch?.[0];

  if (candidate) {
    return JSON.parse(candidate);
  }

  throw new SyntaxError(`No valid JSON found in LLM output:\n${text.slice(0, 200)}`);
}

// ── extract() ─────────────────────────────────────────────────────────────────

export interface ExtractOptions<T> {
  /** Model to use. Falls back to the runtime's default model. */
  model?: string;
  /** System prompt. Defaults to a generic "respond with JSON only" instruction. */
  system?: string;
  /**
   * Validate and transform the parsed JSON.
   * Return the typed value or throw to trigger a retry.
   *
   * @example Zod schema
   * ```ts
   * validate: (data) => MySchema.parse(data)
   * ```
   * @example Manual check
   * ```ts
   * validate: (data) => {
   *   if (typeof data !== "object" || data === null) throw new Error("Expected object");
   *   return data as MyType;
   * }
   * ```
   */
  validate?: (data: unknown) => T;
  /** Max retries on parse / validation failure. Default: 2 */
  maxRetries?: number;
  /** Max tokens per attempt. Default: 4096 */
  maxTokens?: number;
}

const JSON_SYSTEM_DEFAULT =
  "You are a data extraction assistant. " +
  "Respond ONLY with valid JSON — no markdown, no prose, no explanation.";

/**
 * Make a single LLM call and return the parsed, optionally validated result.
 *
 * Retries up to `maxRetries` times if the output is unparseable or fails
 * validation. Each retry appends the previous error to the conversation so
 * the model can self-correct.
 *
 * @example
 * ```ts
 * const plan = await extract(client, model,
 *   "Extract a task list from: Review PR #42, deploy to staging, write release notes",
 *   { validate: (d) => TaskListSchema.parse(d) },
 * );
 * ```
 */
export async function extract<T = unknown>(
  client: LLMClient,
  model: string,
  prompt: string,
  options: ExtractOptions<T> = {},
): Promise<T> {
  const { modelId } = parseModelString(model);
  const system = options.system ?? JSON_SYSTEM_DEFAULT;
  const maxRetries = options.maxRetries ?? 2;
  const maxTokens = options.maxTokens ?? 4096;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: prompt },
  ];

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await client.createMessage({
      model: modelId,
      system,
      messages,
      tools: [],
      maxTokens,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock?.type === "text" ? textBlock.text : "";

    try {
      const parsed = parseJsonOutput(raw);
      return options.validate ? options.validate(parsed) : (parsed as T);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        // Give the model its output back so it can correct itself
        messages.push({ role: "assistant", content: raw });
        messages.push({
          role: "user",
          content:
            `Your previous response could not be parsed: ${err instanceof Error ? err.message : String(err)}. ` +
            `Please fix it and respond with valid JSON only.`,
        });
      }
    }
  }

  throw new Error(
    `extract() failed after ${maxRetries + 1} attempt(s): ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
