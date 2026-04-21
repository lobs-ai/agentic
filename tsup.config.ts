import { defineConfig } from "tsup";

/**
 * Bundle the `agentic` root package.
 *
 * - Main entry (`agentic`): bundles the @agentic/* workspace sources into a
 *   single dist/index.js. Third-party deps stay external.
 * - Discord subpath (`agentic/discord`): bundles packages/discord and keeps
 *   `agentic` external so the consumer's AgenticRuntime instance is shared.
 */
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "node18",
    platform: "node",
    splitting: false,
    treeshake: true,
    tsconfig: "./tsconfig.json",
    external: [
      "@anthropic-ai/sdk",
      "openai",
      "yaml",
      "playwright",
      "pptxgenjs",
    ],
    noExternal: [
      "@agentic/llm",
      "@agentic/tools",
      "@agentic/runner",
      "@agentic/runtime",
    ],
  },
  {
    entry: { discord: "packages/discord/src/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: false,
    target: "node18",
    platform: "node",
    splitting: false,
    treeshake: true,
    tsconfig: "./tsconfig.json",
    external: [
      "agentic",
      "discord.js",
      "@anthropic-ai/sdk",
      "openai",
      "yaml",
      "playwright",
      "pptxgenjs",
    ],
    noExternal: [
      "@agentic/llm",
      "@agentic/tools",
      "@agentic/runner",
      "@agentic/runtime",
    ],
  },
]);
