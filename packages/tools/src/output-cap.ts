/**
 * Output cap — truncate tool output to a reasonable size.
 */

const DEFAULT_MAX_CHARS = 100_000;
const DEFAULT_MAX_LINES = 3000;

/**
 * Cap output to a maximum number of characters and lines.
 * Adds a truncation notice if trimmed.
 */
export function capOutput(
  output: string,
  maxChars = DEFAULT_MAX_CHARS,
  maxLines = DEFAULT_MAX_LINES,
): string {
  const lines = output.split("\n");
  let result = output;

  // Cap by lines first
  if (lines.length > maxLines) {
    result = lines.slice(0, maxLines).join("\n");
    result += `\n\n[Output truncated: showed ${maxLines} of ${lines.length} lines]`;
    return result;
  }

  // Cap by chars
  if (output.length > maxChars) {
    result = output.slice(0, maxChars);
    const lastNewline = result.lastIndexOf("\n");
    if (lastNewline > 0) result = result.slice(0, lastNewline);
    result += `\n\n[Output truncated: showed ${result.length} of ${output.length} chars]`;
  }

  return result;
}
