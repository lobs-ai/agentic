/**
 * Tool auto-discovery.
 *
 * Scans a directory for `.js`, `.mjs`, `.ts`, `.mts` files and imports each
 * one. Any exported value that looks like a `BaseTool` instance or subclass
 * is instantiated (if a class) and returned.
 *
 * Detection uses structural duck-typing so it's robust across multiple copies
 * of the library (avoids `instanceof` failures from module-path mismatches).
 *
 * Conventions supported by tool files:
 *
 * 1. **Instance export** — export a `BaseTool` instance directly:
 *    ```ts
 *    export default new MyTool();
 *    // or
 *    export const myTool = new MyTool();
 *    ```
 *
 * 2. **Class export** — export a `BaseTool` subclass (no-arg constructor):
 *    ```ts
 *    export default class MyTool extends BaseTool { ... }
 *    // or
 *    export class MyTool extends BaseTool { ... }
 *    ```
 *
 * Files that fail to import are skipped with a console warning.
 */

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { BaseTool } from "@agentic/tools";

const TOOL_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"]);

/**
 * Convert a simple glob pattern (supports `*` and `?`) to a RegExp.
 * Matches against the filename only (not the full path).
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex specials except * and ?
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

/** Duck-type check: is `v` a `BaseTool` instance? */
function isToolInstance(v: unknown): v is BaseTool {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof (v as Record<string, unknown>).name === "string" &&
    typeof (v as Record<string, unknown>).description === "string" &&
    typeof (v as Record<string, unknown>).run === "function"
  );
}

/** Duck-type check: is `v` a `BaseTool` subclass (a constructor)? */
function isToolClass(
  v: unknown,
): v is new () => BaseTool {
  return (
    typeof v === "function" &&
    (v as { prototype?: unknown }).prototype !== null &&
    typeof ((v as { prototype?: Record<string, unknown> }).prototype as Record<string, unknown>)?.run === "function"
  );
}

function extractToolsFromModule(mod: Record<string, unknown>): BaseTool[] {
  const tools: BaseTool[] = [];

  for (const value of Object.values(mod)) {
    if (isToolInstance(value)) {
      tools.push(value);
    } else if (isToolClass(value)) {
      try {
        tools.push(new value());
      } catch {
        // Skip classes that require constructor args
      }
    }
  }

  return tools;
}

/**
 * Load all `BaseTool` implementations from a single file.
 *
 * @param file Absolute or relative path to a `.ts`, `.js`, etc. module.
 * @returns    Instantiated tools exported from that file.
 */
export async function loadToolFile(file: string): Promise<BaseTool[]> {
  const absFile = resolve(file);
  try {
    const mod = (await import(pathToFileURL(absFile).href)) as Record<string, unknown>;
    return extractToolsFromModule(mod);
  } catch (err) {
    console.warn(`[agentic] Skipping tool file ${absFile}:`, err);
    return [];
  }
}

/**
 * Discover all `BaseTool` implementations in a directory.
 *
 * @param dir     Absolute or relative directory path.
 * @param pattern Optional glob pattern matched against filenames only
 *                (e.g. `"*.tool.ts"`). When omitted, all `.ts`/`.js` files
 *                are included.
 * @returns       Instantiated tools found across matching files.
 */
export async function discoverTools(dir: string, pattern?: string): Promise<BaseTool[]> {
  const absDir = resolve(dir);
  const patternRe = pattern ? patternToRegex(pattern) : null;
  const tools: BaseTool[] = [];

  let entries: { name: string; isFile: () => boolean }[];
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    console.warn(`[agentic] Tool directory not found or unreadable: ${absDir}`);
    return tools;
  }

  const files = entries
    .filter((e) => {
      if (!e.isFile()) return false;
      const dot = e.name.lastIndexOf(".");
      if (dot === -1 || !TOOL_EXTENSIONS.has(e.name.slice(dot))) return false;
      return patternRe ? patternRe.test(e.name) : true;
    })
    .map((e) => join(absDir, e.name));

  const results = await Promise.all(files.map((f) => loadToolFile(f)));
  for (const found of results) tools.push(...found);

  return tools;
}
