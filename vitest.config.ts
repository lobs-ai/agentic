import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 10_000,
  },
  resolve: {
    alias: {
      "@agentic/llm": path.resolve(__dirname, "packages/llm/src/index.ts"),
      "@agentic/tools": path.resolve(__dirname, "packages/tools/src/index.ts"),
      "@agentic/runner": path.resolve(__dirname, "packages/runner/src/index.ts"),
      "@agentic/runtime": path.resolve(__dirname, "packages/runtime/src/index.ts"),
      agentic: path.resolve(__dirname, "packages/runtime/src/index.ts"),
    },
  },
});
