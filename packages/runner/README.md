# @agentic/runner

The core agent execution loop — LLM ↔ tool cycle with multi-provider support,
loop detection, context compaction, and lifecycle hooks.

## Install

```bash
npm install @agentic/runner @agentic/llm @agentic/tools
```

## Quick start

```typescript
import { runAgent } from "@agentic/runner";

const result = await runAgent({
  task: "List all TypeScript files in the project and count them.",
  agent: "programmer",
  model: "anthropic/claude-sonnet-4-20250514",
  cwd: "/path/to/project",
  tools: ["exec", "read", "write", "edit"],
  timeout: 120, // seconds
});

console.log(result.output);
console.log(`Cost: $${result.costUsd.toFixed(4)} over ${result.turns} turns`);
```

## AgentSpec

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `task` | `string` | ✓ | Task prompt |
| `agent` | `string` | ✓ | Agent type label (programmer, writer, etc.) |
| `model` | `string` | ✓ | `"provider/model-id"` or bare model ID |
| `cwd` | `string` | ✓ | Working directory for file/exec tools |
| `tools` | `string[]` | ✓ | Tool names to enable |
| `timeout` | `number` | ✓ | Max seconds before forced stop |
| `systemPrompt` | `string` | — | Override the system prompt |
| `maxTurns` | `number` | — | Override max LLM turns (default 100) |
| `maxTokens` | `number` | — | Max tokens per response (default 16384) |
| `initialMessages` | `LLMMessage[]` | — | Seed with existing history (resume) |
| `clientOverride` | `LLMClient` | — | Inject a custom LLM client |
| `toolExecutor` | `ToolExecutor` | — | Inject custom tool execution |
| `context` | `AgentContext` | — | Task IDs, channel IDs, notes |
| `onProgress` | `function` | — | Progress callback |
| `modelTier` | `string` | — | Tier hint for fallback selection |
| `sanitizeResponseContent` | `function` | — | Rewrite response blocks before storing |

## AgentResult

```typescript
interface AgentResult {
  succeeded: boolean;
  output: string;       // Final assistant text
  error?: string;       // Set when succeeded = false
  usage: TokenUsage;    // { inputTokens, outputTokens }
  costUsd: number;
  turns: number;
  runId: string;        // Unique hex ID for this run
}
```

## Lifecycle hooks

```typescript
import { getHookRegistry } from "@agentic/runner";

const hooks = getHookRegistry();

// Observe tool calls
hooks.register("before_tool_call", async (event) => {
  console.log("Tool:", event.data.toolName);
  return event; // pass through
});

// Deny a specific tool
hooks.register("before_tool_call", async (event) => {
  if (event.data.toolName === "exec") return null; // deny
  return event;
});

// Modify tool result
hooks.register("after_tool_call", async (event) => {
  event.data.result = { ...event.data.result, content: "sanitized" };
  return event;
});
```

### Available hook events

| Event | Fired when |
|-------|-----------|
| `before_agent_start` | Before the first LLM call |
| `after_agent_end` | After the run completes (success or failure) |
| `before_llm_call` | Before each LLM API call |
| `after_llm_call` | After each LLM API call |
| `before_tool_call` | Before each tool is executed (return `null` to deny) |
| `after_tool_call` | After each tool completes (can override result) |
| `on_error` | On LLM or tool errors |
| `session_compacted` | When context window compaction fires |

## Custom tool executor

```typescript
const result = await runAgent({
  // ...
  toolExecutor: async (toolName, params, toolUseId, cwd) => {
    if (toolName === "my_custom_tool") {
      return { toolUseId, content: "custom result" };
    }
    // Fall back to built-in registry
    return executeTool(toolName, params, toolUseId, cwd);
  },
});
```

## Register custom tools

```typescript
import { registerTool } from "@agentic/runner";

registerTool("my_tool", {
  definition: {
    name: "my_tool",
    description: "Does something useful",
    input_schema: {
      type: "object",
      properties: { input: { type: "string" } },
      required: ["input"],
    },
  },
  execute: async (params) => {
    return { output: `Processed: ${params.input}` };
  },
});
```

## Loop detection

The runner automatically detects when an agent is stuck in a loop:

- **Generic repeat** — same tool + same input called repeatedly
- **Poll no-progress** — same tool always returns identical output
- **Ping-pong** — alternating between two tools without progress

Loop warnings are appended to the tool result so the model can self-correct.
Critical loops (15+ identical calls) get a hard interrupt message.

## Context compaction

When the conversation approaches 80% of the model's context window, the runner
automatically compacts old tool results (truncated to 500 chars) while keeping
the task prompt and recent turns intact. The Anthropic-required `tool_use` /
`tool_result` pairing is always preserved.

## Session transcripts

Each run writes to `~/.lobs/agents/{agentType}/sessions/{runId}.jsonl` and
a human-readable `{runId}.md` summary. Transcripts can be used to resume
interrupted runs by passing the history as `initialMessages`.

## Supported models

Provider prefix determines the client used:

| Prefix | Examples |
|--------|---------|
| `anthropic/` | claude-sonnet-4, claude-opus-4, claude-haiku |
| `openai/` | gpt-4o, gpt-4o-mini, o1, o3-mini |
| `google/` | gemini-2.0-flash, gemini-1.5-pro |
| *(none)* | Treated as Anthropic by default |
