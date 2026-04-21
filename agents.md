# agents.md — Agentic

## What it is

A TypeScript monorepo providing a complete agent runtime for production use. Four packages that compose cleanly:

- **`agentic`** — top-level runtime (`AgenticRuntime`, `ConfigStore`, `PromptBuilder`, `extract`)
- **`@agentic/llm`** — multi-provider LLM client with key management, retries, fallback chains, circuit breaker
- **`@agentic/runner`** — agent execution loop (`runAgent`), `Session`, hooks, context engine, loop detection
- **`@agentic/tools`** — 9 built-in tools + `ToolRegistry` + `BaseTool` base class

## Package layout

```
packages/
  agentic/src/
    runtime.ts          AgenticRuntime — wires everything together
    config-store.ts     ConfigStore — programmatic config r/w
    config-loader.ts    loadConfigFile / parseConfigFile / findConfigFile
    context-factory.ts  createContextEngine (from AgenticConfig.contextEngine)
    provider-factory.ts buildCustomClient (from ProviderConfig with type:)
    prompt-builder.ts   PromptBuilder — fluent system prompt construction
    output.ts           parseJsonOutput, extract<T>
    types.ts            AgenticConfig, ProviderConfig, ToolsConfig, etc.
    index.ts            barrel — re-exports everything from all packages

  llm/src/
    client.ts           createClient, createResilientClient, inferProvider
    anthropic.ts        AnthropicClient
    openai.ts           OpenAIClient
    openai-compatible.ts OpenAICompatibleClient
    resilient.ts        ResilientLLMClient (wraps any client)
    key-manager.ts      KeyManager, getKeyManager, configureKeyManager
    circuit-breaker.ts  CircuitBreaker
    models.ts           MODELS, FALLBACK_CHAINS, MODEL_COSTS, getModelInfo
    types.ts            LLMClient, LLMMessage, LLMResponse, etc.

  runner/src/
    agent-loop.ts       runAgent — main LLM↔tool execution loop
    agent.ts            Agent class (wraps runAgent, exposes .run())
    session.ts          Session, SessionStore interface
    context-engine.ts   ContextEngine interface, TruncatingContextEngine, NoopContextEngine
    context-manager.ts  shouldCompact, compactMessages, estimateTokens, getContextLimit
    hooks.ts            HookRegistry, getHookRegistry, resetHookRegistry
    loop-detector.ts    LoopDetector
    session-transcript.ts SessionTranscript (filesystem run records)
    tool-registry.ts    getToolDefinitions, executeTool (legacy flat-array API)
    types.ts            AgentSpec, AgentResult, AgentConfig, TokenUsage, ToolResult, etc.

  tools/src/
    base-tool.ts        BaseTool abstract class, ToolContext
    registry.ts         ToolRegistry (.register, .get, .filter, .tagged, .execute)
    read.ts             ReadTool + snapshot cache (recentReadCache, hasRecentlyReadFile, etc.)
    write.ts            WriteTool
    edit.ts             EditTool (fuzzy match, quote normalization, diff output, batch edits)
    exec.ts             ExecTool (CWD marker, SIGTERM/SIGKILL, background)
    ls.ts               LsTool
    grep.ts             GrepTool (rg with grep fallback)
    glob.ts             GlobTool (fd with find fallback)
    find-files.ts       FindFilesTool
    code-search.ts      CodeSearchTool
    output-cap.ts       capOutput(output, maxChars, maxLines, hint?)
    path-utils.ts       resolveToCwd (handles ~)
    index.ts            barrel: BUILTIN_TOOLS, defaultRegistry, ALL_TOOLS, executeTool
```

## Key invariants

**Read-before-edit enforcement.** `EditTool` (and by extension `edit.ts`) calls `hasRecentlyReadFile(path, cwd)` and throws if the file was not recently read. This prevents editing stale content. `WriteTool` registers a snapshot after writing so subsequent edits don't require a re-read.

**Snapshot cache keys.** The read cache uses `"${resolvedPath}:full"` or `"${resolvedPath}:${offset}:${limit}"` as keys. `getReadSnapshot(resolvedPath)` scans with `startsWith` so any cached variant satisfies the check. `updateReadSnapshot(resolved, content, mtimeMs, size)` updates all matching variants.

**Staleness check.** Before applying an edit, `EditTool` computes `createReadSnapshot(content, mtimeMs, size)` on the current file and compares `size` + `contentHash` (djb2) against the stored snapshot. Mtime alone is not used.

**CWD tracking in exec.** `ExecTool` appends `; printf '\n__AGENTIC_CWD__:%s' "$(pwd)"` to every command. The loop strips this marker from stdout and, if the CWD changed, returns `{ result, sideEffects: { newCwd } }`. The agent loop in `runner/agent-loop.ts` propagates `newCwd` to its `cwd` variable.

**Tool tags.** `ToolDefinition.tags` is `readonly string[] | undefined`. Tags are stripped before sending to the LLM (the loop maps `{ name, description, input_schema }`). Use them only for runtime selection via `registry.tagged()` or `ContextEngine.selectTools`.

**Session shared state.** `session._ref()` returns the mutable `LLMMessage[]` array. The agent loop mutates this array in-place; application code reading `session.messages` (readonly view) sees live updates without any callbacks.

**ToolSelector vs selectTools.** `ToolSelector` (in `AgenticConfig.tools.select`) is called once at `runtime.agent()` time. `ContextEngine.selectTools(messages, registry)` is called every LLM turn inside the loop — use it for dynamic per-turn restrictions.

**Provider name casing.** Provider names are lowercased before storage in `_providers` Map and before lookup. `runtime.provider("MY-PROVIDER", ...)` and `"my-provider/model"` refer to the same entry.

**KeyManager is global.** `configureKeyManager(kmCfg)` sets state in a module-level singleton. `AgenticRuntime.create()` calls it during initialization; `AgenticRuntime.reload()` calls it again when new keys are provided.

**`ProviderConfig` naming.** There are two types named `ProviderConfig`: the user-facing `AgenticConfig.ProviderConfig` in `agentic/src/types.ts` (keys, rotation, fallbackTo, type, baseUrl) and the internal resolved pair `{ provider, modelId }` in `@agentic/llm`. The barrel does NOT re-export the llm one — users get the agentic-level one.

## Extension points

### Add a custom tool

```typescript
import { BaseTool, type ToolContext } from "agentic";

class MyTool extends BaseTool {
  name = "my_tool";
  description = "Does X.";
  tags = ["readonly"];  // optional — for registry.tagged() filtering
  inputSchema = {
    type: "object" as const,
    properties: { query: { type: "string" } },
    required: ["query"],
  };
  async run({ query }: { query: string }, ctx: ToolContext) {
    return `result for ${query} in ${ctx.cwd}`;
    // ctx.meta holds agent context (userId, channelId, etc.)
  }
}

rt.tool(new MyTool()); // register on existing runtime
// or: AgenticRuntime.create({ tools: { instances: [new MyTool()] } })
// or: AgenticRuntime.create({ tools: { dirs: ["./tools"] } })  // auto-discover
```

### Add a custom provider

```typescript
rt.provider("my-service", {
  type: "openai-compatible",
  baseUrl: "https://api.my-service.com/v1",
  headers: { "X-Custom-Header": "value" },
});
// Use as: rt.agent({ model: "my-service/model-name" })
```

### Custom context engine

```typescript
import { type ContextEngine, type ToolRegistry } from "agentic";

class MyEngine implements ContextEngine {
  shouldCompact(messages, model) { return messages.length > 40; }
  compact(messages) { return [messages[0], ...messages.slice(-10)]; }
  selectTools(messages, registry: ToolRegistry) {
    // called every turn — return string[] or undefined (all tools)
    return messages.length > 20 ? registry.tagged("readonly") : undefined;
  }
}

rt.agent({ contextEngine: new MyEngine() }).run(task);
```

### Hooks

```typescript
import { getHookRegistry } from "agentic";

getHookRegistry().register("before_tool_call", async (event) => {
  if (event.data.toolName === "exec") return null; // deny
  return event;                                    // allow (optionally mutate)
});

// Hook events: before_agent_start, after_agent_end, before_llm_call,
//              after_llm_call, before_tool_call, after_tool_call,
//              on_error, session_compacted
```

## Config file formats

Search order from `process.cwd()` (or supplied directory):
1. `agentic.yaml` / `agentic.yml` — YAML with `${ENV_VAR}` interpolation
2. `agentic.config.ts` / `.mts` / `.js` / `.mjs` / `.cjs` — ESM module, default export is `AgenticConfig`
3. `agentic.config.json`

YAML/JSON: declarative fields only (`tools.select` is code-only).
TS/JS: full `AgenticConfig` including functions (`tools.select`, `tools.register`, `tools.instances`).

## AgentResult fields

```typescript
{
  succeeded: boolean;   // false on timeout, maxTurns, or unhandled error
  output: string;       // last assistant text block
  error?: string;       // error message when succeeded=false
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  costUsd: number;      // estimated, based on MODEL_COSTS table
  turns: number;
  runId: string;        // hex, unique per run
}
```

## Gotchas

- `agent.run(task)` passes `task` as a user message. If you want a different message structure, pass `initialMessages` (on `AgentSpec`) or use a pre-seeded `Session`.
- `AgentSpec.tools` is `string[]` (tool names), not tool definitions. Names are resolved against `toolRegistry`.
- `capOutput` defaults changed: 50 000 chars / 2000 lines (up from 8000/200). Output-heavy tools (exec, grep) cap at `25 000 chars / 500 lines` explicitly.
- `readTool` returns raw content (no line numbers) when `full: true`. Use offset/limit for partial reads; full mode rejects files > 200 KB.
- Edit `old_string` matching order: exact → curly-quote normalization → fuzzy whitespace suggestion (throws, does not apply).
