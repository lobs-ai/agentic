/**
 * Config file loader.
 *
 * Supports YAML (primary), JSON, and JS/TS module formats.
 * YAML values support `${ENV_VAR}` interpolation.
 *
 * `loadConfigFile(path?)` accepts:
 *   - nothing / undefined  → searches for agentic.yaml / agentic.config.* in process.cwd()
 *   - a directory path     → searches that directory
 *   - a file path          → loads that file directly
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import type { AgenticConfig } from "./types.js";

// ── File search order ─────────────────────────────────────────────────────────

const CONFIG_FILENAMES = [
  "agentic.yaml",
  "agentic.yml",
  "agentic.config.ts",
  "agentic.config.mts",
  "agentic.config.js",
  "agentic.config.mjs",
  "agentic.config.cjs",
  "agentic.config.json",
];

// ── Env-var interpolation ─────────────────────────────────────────────────────

function interpolateStr(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, name: string) => process.env[name] ?? "");
}

/** Recursively replace `${VAR}` in all string values of an object/array. */
export function interpolate(obj: unknown): unknown {
  if (typeof obj === "string") return interpolateStr(obj);
  if (Array.isArray(obj)) return obj.map(interpolate);
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, interpolate(v)]),
    );
  }
  return obj;
}

// ── File discovery ────────────────────────────────────────────────────────────

/**
 * Find the config file at `pathOrDir`.
 *
 * - When it's a file path, returns it directly.
 * - When it's a directory (or omitted), searches for known config filenames.
 * - Returns `null` if nothing is found.
 */
export function findConfigFile(pathOrDir?: string): string | null {
  const abs = resolve(pathOrDir ?? process.cwd());
  if (existsSync(abs) && statSync(abs).isFile()) return abs;
  for (const name of CONFIG_FILENAMES) {
    const full = join(abs, name);
    if (existsSync(full)) return full;
  }
  return null;
}

// ── File parsing ──────────────────────────────────────────────────────────────

/**
 * Parse a config file into an `AgenticConfig` object.
 *
 * @param fullPath Absolute path to a `.yaml`, `.yml`, `.json`, `.ts`, or `.js` file.
 */
export async function parseConfigFile(fullPath: string): Promise<AgenticConfig> {
  const ext = extname(fullPath).toLowerCase();
  if (ext === ".yaml" || ext === ".yml") {
    const raw = readFileSync(fullPath, "utf-8");
    return interpolate(parseYaml(raw)) as AgenticConfig;
  }
  if (ext === ".json") {
    try {
      return JSON.parse(readFileSync(fullPath, "utf-8")) as AgenticConfig;
    } catch (err) {
      throw new Error(`[agentic] Failed to parse ${fullPath}: ${err}`);
    }
  }
  // JS / TS module
  try {
    const mod = (await import(pathToFileURL(fullPath).href)) as Record<string, unknown>;
    return (mod.default ?? mod) as AgenticConfig;
  } catch (err) {
    throw new Error(
      `[agentic] Failed to load config from ${fullPath}: ${err}\n` +
        `If this is a TypeScript file, run your app with tsx or bun.`,
    );
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load an `AgenticConfig` from a path or the current directory.
 *
 * @param pathOrDir
 *   - Omit → search `process.cwd()` for config files
 *   - Directory path → search that directory
 *   - File path → load that file directly
 *
 * @returns Parsed config, or `{}` when no file is found (directory search only).
 */
export async function loadConfigFile(pathOrDir?: string): Promise<AgenticConfig> {
  const filePath = findConfigFile(pathOrDir);
  if (!filePath) return {};
  return parseConfigFile(filePath);
}
