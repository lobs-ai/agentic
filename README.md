# Agentic

A TypeScript runtime for building production AI agents. One package install gets you a complete agent loop: LLM routing, tool execution, session management, context compaction, resilience, and hot config reload.

```
npm install agentic
```

---

## How it works

An agent is a loop: call the LLM, execute the tools it requests, feed the results back, repeat until it stops or times out. Agentic wires up that loop and everything around it so you write application logic instead of plumbing.

```
agentic.yaml (or inline config)
       │
       ▼
AgenticRuntime.create()
       │
       ├─ ToolRegistry   ← built-in tools + your custom tools
       ├─ LLM clients    ← Anthropic, OpenAI, Groq, Ollama, any OpenAI-compatible
       ├─ KeyManager     ← key pool, rotation, circuit breaker
       ├─ ContextEngine  ← conversation window management
       └─ HookRegistry   ← observe/intercept every step
              │
              ▼
       runtime.agent({ model, task }).run()
              │
       AgentResult { output, usage, costUsd, turns, runId }
```

---

## Quick start

### 1. API key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

No config file needed for the default case.

### 2. Run an agent

```typescript
import { AgenticRuntime } from "agentic";

const rt = await AgenticRuntime.create({
  defaults: { model: "claude-sonnet-4-6" },
});

const result = await rt.agent({
  cwd: process.cwd(),
  timeout: 120,
}).run("Summarize every TODO comment in the src/ directory.");

console.log(result.output);
// result.usage.inputTokens, result.costUsd, result.turns ...
```

### 3. Or load config from a file

```typescript
const rt = await AgenticRuntime.fromConfig(); // reads agentic.yaml from cwd
const result = await rt.agent().run("What files are in src/?");
```

---

## agentic.yaml

The recommended way to configure the runtime. Supports `${ENV_VAR}` interpolation.

```yaml
# agentic.yaml

defaults:
  model: claude-sonnet-4-6
  timeout: 300
  maxTurns: 100
  maxTokens: 16384

providers:
  anthropic:
    keys:
      - ${ANTHROPIC_API_KEY}
      - key: ${ANTHROPIC_KEY_2}
        label: backup
    rotation: sticky           # sticky | round-robin | least-used
    fallbackTo:
      - openai/gpt-4o
      - groq/llama3-70b-8192

resilience:
  retries: 3
  backoffMs: 1000
  maxBackoffMs: 30000
  circuitBreaker:
    enabled: true
    failureThreshold: 10       # failures before circuit opens
    cooldownMinutes: 30
    windowMinutes: 60

tools:
  builtins: all                # all | none | [read, exec, grep, ...]

contextEngine:
  type: truncating             # truncating | noop | module
  keepRecentTurns: 5
  compactThreshold: 0.8        # compact when context is 80% full
```

Other supported formats: `agentic.yml`, `agentic.config.ts`, `agentic.config.js`, `agentic.json`.

---

## Providers

Built-in providers are auto-routed from environment variables. You only need a `providers` entry when you want multiple keys, fallbacks, or a custom endpoint.

| Provider | Env var | Example model |
|----------|---------|---------------|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| `openai` | `OPENAI_API_KEY` | `openai/gpt-4o` |
| `groq` | `GROQ_API_KEY` | `groq/llama3-70b-8192` |
| `deepseek` | `DEEPSEEK_API_KEY` | `deepseek/deepseek-chat` |
| `google` | `GOOGLE_API_KEY` | `google/gemini-2.0-flash` |
| `mistral` | `MISTRAL_API_KEY` | `mistral/mistral-large-latest` |
| `openrouter` | `OPENROUTER_API_KEY` | `openrouter/anthropic/claude-3-5-sonnet` |
| `ollama` | _(none)_ | `ollama/llama3` |

### Custom / local endpoints

```typescript
rt.provider("my-ollama", {
  type: "openai-compatible",
  baseUrl: "http://localhost:11434/v1",
});

const result = await rt.agent({ model: "my-ollama/llama3" }).run(task);
```

Or in YAML:

```yaml
providers:
  my-ollama:
    type: openai-compatible
    baseUrl: http://localhost:11434/v1
```

---

## Tools

### Built-in tools

| Tool | Description | Tags |
|------|-------------|------|
| `read` | Read file contents (line-numbered, offset/limit, binary-safe) | `filesystem`, `readonly` |
| `write` | Write or overwrite a file (auto-creates directories) | `filesystem`, `write` |
| `edit` | Exact find-and-replace with fuzzy fallback and diff output | `filesystem`, `write` |
| `exec` | Run shell commands (cwd tracking, timeout, background support) | `exec`, `shell` |
| `ls` | List directory contents | `filesystem`, `readonly`, `directory` |
| `grep` | Ripgrep-powered content search with fallback to grep | `filesystem`, `readonly`, `search` |
| `glob` | Find files by pattern (fd or find) | `filesystem`, `readonly`, `search` |
| `find_files` | Find files with type/extension/depth filtering | `filesystem`, `readonly`, `search` |
| `code_search` | Ripgrep with context lines for code navigation | `filesystem`, `readonly`, `search` |

### Restrict which tools an agent can use

```typescript
// Pass an explicit list
rt.agent({ tools: ["read", "grep", "glob"] }).run(task);

// Or use registry tag filtering
const readOnly = rt.toolRegistry.tagged("readonly");
rt.agent({ tools: readOnly }).run(task);
```

### Per-session dynamic tool selection

Use a `ToolSelector` to choose tools at agent-creation time based on context:

```typescript
const rt = await AgenticRuntime.create({
  tools: {
    select(registry, context) {
      // restrict to read-only for untrusted sessions
      if (context?.notes?.includes("untrusted")) {
        return registry.tagged("readonly");
      }
      return undefined; // all tools
    },
  },
});
```

The context engine can further restrict tools per LLM turn — see [Custom context engines](#custom-context-engines).

### Adding custom tools

```typescript
import { BaseTool } from "agentic";

class GitStatusTool extends BaseTool {
  name = "git_status";
  description = "Returns the current git status.";
  tags = ["readonly"];
  inputSchema = { type: "object" as const, properties: {} };

  async run(_input: {}, ctx) {
    const { execSync } = await import("node:child_process");
    return execSync("git status --short", { cwd: ctx.cwd }).toString();
  }
}

rt.tool(new GitStatusTool());
```

Or auto-discover from a directory — put any number of `BaseTool` subclasses in a folder:

```yaml
# agentic.yaml
tools:
  dirs:
    - ./tools
    - { dir: ./src/agent-tools, pattern: "*.tool.ts" }
```

---

## Session management

A `Session` is a shared, observable message array. Pass one to an agent run so you can read the conversation while it is in progress.

```typescript
import { Session } from "agentic";

const session = new Session();

// Start the run (non-blocking)
const runPromise = rt.agent().run(task, { session });

// Read messages at any point while it runs
console.log(session.messages);

// Wait for completion
const result = await runPromise;
```

### Persistent sessions (database-backed)

```typescript
import { type SessionStore } from "agentic";

// Implement the two-method interface against any store
const myStore: SessionStore = {
  async load(sessionId) { /* return LLMMessage[] */ },
  async save(sessionId, messages) { /* persist */ },
};

// Resume a prior session
const session = await Session.fromStore("session-abc", myStore);

// Messages are written back to the store automatically after the run
const result = await rt.agent().run(newTask, { session });
await session.flush(); // explicit flush if needed
```

---

## Named agents and multi-agent workflows

Define agents once, reuse them anywhere:

```typescript
const planner = rt.defineAgent({
  name: "planner",
  model: "claude-opus-4-7",
  systemPrompt: "You are a structured planning assistant. Respond with JSON.",
  tools: [],
});

const coder = rt.defineAgent({
  name: "coder",
  model: "claude-sonnet-4-6",
  systemPrompt: "You are an expert TypeScript developer.",
  tools: ["read", "write", "edit", "exec"],
});

// Each call to the factory creates a fresh Agent instance
const plan = await planner().run("Plan the implementation of X.");
const code = await coder().run(`Implement this plan:\n${plan.output}`);
```

---

## Single-turn calls

Not everything needs an agent loop. Use `ask` and `extract` for direct completions:

```typescript
// Plain text response
const summary = await rt.ask("Summarize this in one sentence: " + longText, {
  model: "claude-haiku-4-5",
});

// Structured extraction with validation and auto-retry
import { z } from "zod";
const TaskSchema = z.array(z.object({ title: z.string(), priority: z.number() }));

const tasks = await rt.extract<z.infer<typeof TaskSchema>>(
  "Extract a prioritized task list from: " + notes,
  {
    model: "claude-sonnet-4-6",
    validate: (d) => TaskSchema.parse(d),
    maxRetries: 3,
  },
);
```

---

## Prompt building

`PromptBuilder` is a fluent helper for structured system prompts:

```typescript
import { PromptBuilder } from "agentic";

const system = new PromptBuilder()
  .role("a senior TypeScript developer")
  .rules([
    "Read files before editing them.",
    "Verify your work before concluding.",
  ])
  .section("Project context", "This is a monorepo using npm workspaces.")
  .examples([
    { input: "Rename a function", output: "Use the edit tool with a precise old_string." },
  ])
  .build();

rt.agent({ systemPrompt: system }).run(task);
```

---

## Hooks

Hooks observe and intercept execution at every stage. Register globally or per-agent:

```typescript
import { getHookRegistry } from "agentic";

const hooks = getHookRegistry();

// Log every tool call
hooks.register("before_tool_call", async (event) => {
  console.log(`[tool] ${event.data.toolName}`, event.data.toolInput);
  return event;
});

// Deny exec in production
hooks.register("before_tool_call", async (event) => {
  if (event.data.toolName === "exec" && process.env.NODE_ENV === "production") {
    return null; // returning null denies the tool call
  }
  return event;
});

// Modify tool output
hooks.register("after_tool_call", async (event) => {
  if (event.data.toolName === "read") {
    // strip secrets before they enter the context window
    event.data.result = redact(event.data.result);
  }
  return event;
});
```

Available hook events:

| Event | When | Can deny / modify |
|-------|------|-------------------|
| `before_agent_start` | Before the loop begins | No |
| `after_agent_end` | After the loop ends | No |
| `before_llm_call` | Before each LLM API call | No |
| `after_llm_call` | After each LLM API call | No |
| `before_tool_call` | Before each tool execution | Yes — return `null` to deny |
| `after_tool_call` | After each tool execution | Yes — replace `event.data.result` |
| `on_error` | On LLM or tool error | No |
| `session_compacted` | After context window compaction | No |

---

## Custom context engines

A `ContextEngine` controls the conversation window. The built-in `TruncatingContextEngine` keeps the first message and the most recent turns. To replace it:

```typescript
import { type ContextEngine } from "agentic";

class MyContextEngine implements ContextEngine {
  shouldCompact(messages, model) {
    return messages.length > 40;
  }

  compact(messages) {
    // return a shorter message array
    return [messages[0], ...messages.slice(-10)];
  }

  // Optional: change which tools are available each turn
  selectTools(messages, registry) {
    const writeCount = messages.filter(
      (m) => Array.isArray(m.content) &&
             m.content.some((b: any) => b.type === "tool_use" && b.name === "write")
    ).length;
    if (writeCount >= 3) return registry.tagged("readonly");
    return undefined; // all tools
  }
}

const rt = await AgenticRuntime.create({
  contextEngine: { type: "module", path: "./my-context-engine.js" },
});

// Or inject directly
const agent = rt.agent({ contextEngine: new MyContextEngine() });
```

---

## Hot config reload

Apply config changes to a running runtime without restarting:

```typescript
// Rotate in new API keys
await rt.reload({
  providers: {
    anthropic: { keys: [newKey1, newKey2] },
  },
});

// Or reload from file
await rt.reloadFromConfig(); // re-reads agentic.yaml from cwd
```

`reload` updates keys, provider settings, resilience config, defaults, and the tool selector. In-flight agent runs are not interrupted — they drain with their existing clients.

---

## ConfigStore

Read and write config programmatically without touching the file format:

```typescript
import { ConfigStore } from "agentic";

const store = await ConfigStore.load(); // reads agentic.yaml

store
  .addKey("anthropic", process.env.NEW_KEY!, "prod-key-2")
  .setFallback("anthropic", ["openai/gpt-4o"])
  .setDefaultModel("claude-sonnet-4-6")
  .setRetries(5);

await store.save(); // writes back to same file
```

---

## Low-level packages

You can use any package independently without the full runtime.

### @agentic/llm — just the LLM client

```typescript
import { createClient, createResilientClient } from "@agentic/llm";

// Simple client
const client = createClient("anthropic/claude-sonnet-4-6");

// Resilient client with fallbacks and retries
const resilient = createResilientClient("claude-sonnet-4-6", {
  fallbackModels: ["openai/gpt-4o"],
  maxRetries: 3,
});

const response = await resilient.createMessage({
  model: "claude-sonnet-4-6",
  system: "You are helpful.",
  messages: [{ role: "user", content: "Hello!" }],
  tools: [],
  maxTokens: 1024,
});
```

### @agentic/tools — just the tools

```typescript
import { readTool, editTool, grepTool, ToolRegistry, ReadTool } from "@agentic/tools";

// Functional API
const content = await readTool({ file_path: "./src/index.ts" }, process.cwd());
const results = await grepTool({ pattern: "TODO", glob: "*.ts" }, process.cwd());

// Class-based registry
const registry = new ToolRegistry().register(new ReadTool());
```

### @agentic/runner — just the execution loop

```typescript
import { runAgent, getHookRegistry } from "@agentic/runner";

const result = await runAgent({
  agent: "coder",
  model: "anthropic/claude-sonnet-4-6",
  task: "Fix the failing test.",
  cwd: process.cwd(),
  tools: ["read", "edit", "exec"],
  timeout: 300,
});
```

---

## Package layout

```
packages/
  agentic/    Top-level runtime: AgenticRuntime, ConfigStore, PromptBuilder, extract()
  llm/        Multi-provider LLM client, key management, resilience
  runner/     Agent loop, Session, hooks, context engine, loop detection
  tools/      9 built-in tools + ToolRegistry + BaseTool base class
```

---

## Development

```bash
npm install
npm run build       # build all packages
npm run typecheck   # type-check without emitting
```

## License

MIT
