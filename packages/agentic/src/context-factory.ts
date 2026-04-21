/**
 * Context engine factory.
 *
 * Converts a `ContextEngineConfig` (declarative, serializable) into a live
 * `ContextEngine` instance. This is the runtime seam — callers configure
 * their context strategy in config files or environment variables rather than
 * importing and instantiating classes directly.
 */

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  TruncatingContextEngine,
  NoopContextEngine,
  defaultContextEngine,
  type ContextEngine,
} from "@agentic/runner";
import type { ContextEngineConfig } from "./types.js";

/**
 * Build a `ContextEngine` from a declarative config object.
 *
 * `undefined` or `null` returns the library default (`TruncatingContextEngine`
 * with 80% threshold and 5 recent turns).
 *
 * @example
 * ```ts
 * const engine = await createContextEngine({ type: "truncating", keepRecentTurns: 8 });
 * const noCompact = await createContextEngine({ type: "noop" });
 * const custom = await createContextEngine({ type: "module", path: "./my-engine.js" });
 * ```
 */
export async function createContextEngine(
  config?: ContextEngineConfig,
): Promise<ContextEngine> {
  if (!config) return defaultContextEngine;

  switch (config.type) {
    case "truncating":
      return new TruncatingContextEngine(
        config.keepRecentTurns,
        config.compactThreshold,
      );

    case "noop":
      return new NoopContextEngine();

    case "module": {
      const absPath = resolve(config.path);
      const url = pathToFileURL(absPath).href;
      let mod: unknown;
      try {
        mod = await import(url);
      } catch (err) {
        throw new Error(
          `[agentic] Failed to load context engine module "${config.path}": ${err}`,
        );
      }
      // Accept default export or module itself
      const exported =
        (mod as Record<string, unknown>).default ?? mod;
      if (!isContextEngine(exported)) {
        throw new Error(
          `[agentic] Context engine module "${config.path}" must default-export ` +
            `an object with estimateTokens / shouldCompact / compact methods.`,
        );
      }
      return exported;
    }

    default: {
      const _: never = config;
      throw new Error(`[agentic] Unknown contextEngine type: ${(_ as { type: string }).type}`);
    }
  }
}

function isContextEngine(v: unknown): v is ContextEngine {
  return (
    v !== null &&
    typeof v === "object" &&
    typeof (v as Record<string, unknown>).estimateTokens === "function" &&
    typeof (v as Record<string, unknown>).shouldCompact === "function" &&
    typeof (v as Record<string, unknown>).compact === "function"
  );
}
