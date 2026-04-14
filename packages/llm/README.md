# @agentic/llm

A unified LLM client for **Anthropic**, **OpenAI**, and any **OpenAI-compatible** provider (OpenRouter, LM Studio, Kimi, MiniMax, and more) — with resilience built in.

```ts
import { createResilientClient } from "@agentic/llm";

const client = createResilientClient("anthropic/claude-sonnet-4-20250514", {
  fallbackModels: ["openai/gpt-4.1", "openai/gpt-4.1-mini"],
});

const response = await client.createMessage({
  model: "claude-sonnet-4-20250514",
  system: "You are a helpful assistant.",
  messages: [{ role: "user", content: "Hello!" }],
  tools: [],
  maxTokens: 1024,
});

console.log(response.content[0]); // { type: "text", text: "Hello! How can I help?" }
```

---

## Installation

```bash
npm install @agentic/llm
# or
pnpm add @agentic/llm
```

Set your API keys as environment variables:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export OPENROUTER_API_KEY=sk-or-...
```

---

## Quick Start

### Simple call (no retries)

```ts
import { createClient } from "@agentic/llm";

const client = createClient("openai/gpt-4.1");

const response = await client.createMessage({
  model: "gpt-4.1",
  system: "You are a helpful assistant.",
  messages: [{ role: "user", content: "What is 2 + 2?" }],
  tools: [],
  maxTokens: 256,
});

const text = response.content
  .filter((b) => b.type === "text")
  .map((b) => b.text)
  .join("");

console.log(text); // "4"
```

### With retries and fallbacks (recommended for production)

```ts
import { createResilientClient } from "@agentic/llm";

const client = createResilientClient(
  "anthropic/claude-sonnet-4-20250514",
  {
    fallbackModels: ["openai/gpt-4.1", "kimi/kimi-k2.5"],
    maxRetries: 3,
    sessionId: "my-agent-session", // sticky key assignment for cache hits
  },
);
```

### Using a pre-built fallback chain

```ts
import { createResilientClient, FALLBACK_CHAINS } from "@agentic/llm";

const [primary, ...fallbacks] = FALLBACK_CHAINS.agent;
const client = createResilientClient(primary, { fallbackModels: fallbacks });
```

---

## Provider Support

| Provider | Model String Format | Notes |
|---|---|---|
| Anthropic | `anthropic/claude-sonnet-4-20250514` | Native SDK, extended thinking, prompt caching |
| OpenAI | `openai/gpt-4.1` | Native SDK, tool calling |
| OpenRouter | `openrouter/anthropic/claude-sonnet-4` | Passes model path after prefix |
| LM Studio | `lmstudio/my-local-model` | No API key required |
| Kimi | `kimi/kimi-k2.5` | OpenAI-compatible |
| MiniMax | `minimax/MiniMax-M2.7` | OpenAI-compatible |
| Z.ai | `z-ai/model-name` | OpenAI-compatible |
| OpenCode Zen | `opencode-zen/model-name` | Local, no key required |
| OpenCode Go | `opencode-go/model-name` | Local, no key required |
| Generic | `openai-compatible/model-name` | Any OpenAI-compatible API |

### Generic OpenAI-compatible

```ts
import { createClient } from "@agentic/llm";

const client = createClient("openai-compatible/my-model", {
  baseUrls: { "openai-compatible": "https://my-api.example.com/v1" },
  keys: { "openai-compatible": { keys: [{ key: "my-api-key" }] } },
});
```

---

## Configuration

Pass a `ClientConfig` to override keys or base URLs:

```ts
import { createClient, createResilientClient } from "@agentic/llm";

const config = {
  keys: {
    anthropic: {
      keys: [
        { key: "sk-ant-key-0", label: "primary" },
        { key: "sk-ant-key-1", label: "backup" },
      ],
    },
    openai: {
      keys: [{ key: "sk-openai-key" }],
    },
  },
  baseUrls: {
    // Override Anthropic to use a proxy
    anthropic: "https://my-proxy.example.com",
  },
};

const client = createResilientClient("anthropic/claude-sonnet-4-20250514", {}, config);
```

### Multi-key rotation

When you provide multiple keys per provider, the `KeyManager` rotates between them. Keys are automatically quarantined when rate-limited and recovered after a cooldown:

```ts
import { configureKeyManager, createResilientClient } from "@agentic/llm";

configureKeyManager({
  anthropic: {
    keys: [
      { key: "sk-ant-key-0", label: "key-0" },
      { key: "sk-ant-key-1", label: "key-1" },
      { key: "sk-ant-key-2", label: "key-2" },
    ],
  },
});

// The resilient client will use the key manager automatically
const client = createResilientClient("anthropic/claude-sonnet-4-20250514");
```

---

## Tool Use

```ts
import { createClient, type ToolDefinition } from "@agentic/llm";

const tools: ToolDefinition[] = [
  {
    name: "get_weather",
    description: "Get the current weather for a location.",
    input_schema: {
      type: "object",
      properties: {
        location: { type: "string", description: "City name" },
      },
      required: ["location"],
    },
  },
];

const client = createClient("anthropic/claude-sonnet-4-20250514");

const response = await client.createMessage({
  model: "claude-sonnet-4-20250514",
  system: "You are a weather assistant.",
  messages: [{ role: "user", content: "What's the weather in London?" }],
  tools,
  maxTokens: 1024,
});

// Check if model wants to call a tool
const toolCall = response.content.find((b) => b.type === "tool_use");
if (toolCall && toolCall.type === "tool_use") {
  console.log(toolCall.name);  // "get_weather"
  console.log(toolCall.input); // { location: "London" }
}
```

---

## Extended Thinking (Anthropic)

```ts
import { createClient } from "@agentic/llm";

const client = createClient("anthropic/claude-sonnet-4-20250514");

const response = await client.createMessage({
  model: "claude-sonnet-4-20250514",
  system: "You are a helpful assistant.",
  messages: [{ role: "user", content: "Solve: 17 × 23" }],
  tools: [],
  maxTokens: 4096,
  thinking: {
    type: "enabled",
    budgetTokens: 2048, // how many tokens to spend thinking
  },
});

// The model's internal reasoning (do NOT include in message history)
console.log(response.thinkingContent);

// The visible answer
const text = response.content.find((b) => b.type === "text");
console.log(text?.text);
```

---

## Resilience Features

### Retries with backoff

The `ResilientLLMClient` retries transient errors (5xx, network errors, overloads) with exponential backoff + jitter. Auth failures are never retried.

### Fallback chains

If all retries for the primary model fail, the client moves to the next model in the chain:

```
anthropic/claude-sonnet-4-20250514 → 3 attempts
  ↓ (all fail)
openai/gpt-4.1 → 3 attempts
  ↓ (all fail)
throws: "All LLM providers failed."
```

### Circuit breaker

The circuit breaker tracks failures per model and opens the circuit after a threshold, preventing hammering dead providers. It auto-recovers after a cooldown period.

```ts
import { getCircuitBreaker, CircuitBreaker } from "@agentic/llm";

const cb = getCircuitBreaker();
console.log(cb.getStatus());
// { "anthropic/claude-sonnet-4-20250514": { state: "closed", failureCount: 0 } }

// Configure thresholds
cb.configure({
  failureThreshold: 5,   // open after 5 failures
  cooldownMinutes: 15,   // recover after 15 minutes
  windowMinutes: 30,     // count failures in a 30-minute window
});
```

### Key health tracking

```ts
import { getKeyManager } from "@agentic/llm";

const km = getKeyManager();
console.log(km.getPoolHealthSummary("anthropic"));
// { total: 3, healthy: 2, authFailed: 0, rateLimited: 1, providerFailed: 0 }
```

---

## Model Registry

```ts
import { MODELS, getModelInfo, getModelsByTier, estimateCost } from "@agentic/llm";

// Look up metadata
const info = getModelInfo("anthropic/claude-sonnet-4-20250514");
console.log(info?.costPer1MInput); // 3.00

// Get all cheap models
const cheap = getModelsByTier("cheap");

// Estimate cost
const cost = estimateCost("openai/gpt-4.1", 10_000, 2_000);
console.log(`$${cost?.toFixed(4)}`); // ~$0.0360
```

---

## Parsing Model Strings

```ts
import { parseModelString } from "@agentic/llm";

parseModelString("anthropic/claude-sonnet-4-20250514");
// → { provider: "anthropic", modelId: "claude-sonnet-4-20250514" }

parseModelString("openrouter/anthropic/claude-sonnet-4");
// → { provider: "openrouter", modelId: "anthropic/claude-sonnet-4" }
```

---

## API Reference

### `createClient(model, config?)`

Builds a bare `LLMClient` with no retry logic. Keys come from `config.keys` or environment variables.

### `createResilientClient(model, options?, config?)`

Builds a `ResilientLLMClient` with retries, fallbacks, key rotation, and circuit breaking.

**Options:**
- `fallbackModels?: string[]` — fallback model strings to try if primary fails
- `maxRetries?: number` — retries per model (default: 3)
- `sessionId?: string` — sticky key assignment ID (for cache hit consistency)

### `parseModelString(model)`

Splits `"provider/model-id"` → `{ provider, modelId }`.

### `configureKeyManager(config)`

Configure the global key pool. Called once at startup.

### `getCircuitBreaker()` / `getKeyManager()`

Access the process-level singletons for monitoring or configuration.

---

## License

MIT
