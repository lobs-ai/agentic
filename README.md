# Agentic

A modular TypeScript toolkit for building AI agents. Extracted from battle-tested production code, each package is standalone and composable — use what you need, swap what you don't.

## Packages

| Package | Description | Key Features |
|---------|-------------|-------------|
| [`@agentic/config`](./packages/config/) | Configuration management | Model tiers, API keys, identity, validation, multi-source loading |
| [`@agentic/llm`](./packages/llm/) | Multi-provider LLM client | Anthropic, OpenAI, OpenRouter, LM Studio, resilient retries, fallback chains, key rotation |
| [`@agentic/tools`](./packages/tools/) | Agent tool system | 9 built-in tools (file ops, shell, search), pluggable registry, Anthropic API-compatible schemas |
| [`@agentic/memory`](./packages/memory/) | Persistent agent memory | File + SQLite backends, vector/keyword search, LLM-powered extraction, session continuity |
| [`@agentic/runner`](./packages/runner/) | Agent execution engine | Think→act loop, hook system, loop detection, context management, subagent spawning |

## Quick Start

```typescript
import { createClient } from "@agentic/llm";
import { ALL_TOOLS, executeTool } from "@agentic/tools";
import { runAgent } from "@agentic/runner";

const result = await runAgent({
  model: "anthropic/claude-sonnet-4-20250514",
  systemPrompt: "You are a helpful coding assistant.",
  tools: ALL_TOOLS,
  toolExecutor: (name, params, cwd) => executeTool(name, params, cwd),
  task: "Read the README and summarize this project.",
  cwd: process.cwd(),
});

console.log(result.response);
```

## Architecture

```
┌─────────────────────────────────────────────┐
│                 @agentic/runner              │
│         (think → act → observe loop)        │
│                                             │
│  ┌──────────────┐    ┌───────────────────┐  │
│  │ @agentic/llm │    │  @agentic/tools   │  │
│  │              │    │                   │  │
│  │  Anthropic   │    │  read, write,     │  │
│  │  OpenAI      │    │  edit, exec,      │  │
│  │  OpenRouter  │    │  grep, glob,      │  │
│  │  LM Studio   │    │  ls, find, search │  │
│  └──────┬───────┘    └────────┬──────────┘  │
│         │                     │             │
│  ┌──────┴─────────────────────┴──────────┐  │
│  │           @agentic/config             │  │
│  │  models, keys, identity, validation   │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │           @agentic/memory             │  │
│  │  file store, sqlite, search, extract  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Using Individual Packages

Each package works standalone. You don't need the full stack:

### Just the LLM client

```typescript
import { createClient } from "@agentic/llm";

const client = createClient("anthropic/claude-sonnet-4-20250514", {
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const response = await client.createMessage({
  model: "claude-sonnet-4-20250514",
  system: "You are helpful.",
  messages: [{ role: "user", content: "Hello!" }],
  tools: [],
  maxTokens: 1024,
});
```

### Just the tools

```typescript
import { readTool, execTool, grepTool } from "@agentic/tools";

const fileContent = await readTool({ file_path: "./src/index.ts" }, "/my/project");
const searchResults = await grepTool({ pattern: "TODO", glob: "*.ts" }, "/my/project");
```

### Just memory

```typescript
import { FileMemoryStore } from "@agentic/memory";

const store = new FileMemoryStore({ baseDir: "./memories" });
await store.write({
  content: "User prefers TypeScript over JavaScript",
  category: "preference",
  source: "conversation",
});

const results = await store.search("what language does the user prefer");
```

## Design Principles

- **Standalone packages** — each works independently, compose what you need
- **Dependency injection** — no hardcoded paths, services, or providers. Bring your own.
- **Provider agnostic** — swap LLM providers, storage backends, or tools without changing application code
- **Production hardened** — retry logic, circuit breakers, loop detection, context management
- **TypeScript first** — strict mode, full type coverage, ESM modules

## Development

```bash
# Build all packages
npm run build

# Type check
npm run typecheck
```

## License

MIT
