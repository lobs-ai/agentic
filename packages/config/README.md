# @agentic/config

Configuration system for AI agents — model tiers, API keys, agent identity, and validation.

Extracted from [lobs-core](https://github.com/lobs-ai/lobs-core) as a standalone, reusable package.

## Install

```bash
npm install @agentic/config
```

Requires Node.js ≥ 18. The only runtime dependency is `zod` (used internally for type safety).

---

## Overview

`@agentic/config` manages three concerns:

| Concern | What it does |
|---------|-------------|
| **Model tiers** | Maps abstract tiers (`micro` → `strong`) to concrete model IDs, with fallback chains and cost metadata |
| **API keys** | Loads multi-key pools from config files or env vars, injects them into `process.env` |
| **Identity** | Loads the bot's name/ID and owner details from `identity.json` |

Config can be loaded three ways: from files on disk, from environment variables, or from plain JS objects.

---

## Config Directory

By default, config lives in `~/.agent/config/`. Override with `AGENT_CONFIG_DIR` or by passing `configDir` to any loader function.

```
~/.agent/config/
  models.json          ← model tier definitions (required)
  identity.json        ← bot/owner identity (optional)
  agent.json           ← runtime settings (optional)
  secrets/
    keys.json          ← API keys — gitignore this directory!
```

---

## Model Tiers

Five tiers, ordered by capability and cost:

| Tier | Intended use |
|------|-------------|
| `micro` | Ultra-fast classification, routing, yes/no decisions |
| `small` | Short summaries, simple extraction, light rewriting |
| `medium` | Multi-step reasoning, code generation, analysis |
| `standard` | Default workhorse — handles most tasks well |
| `strong` | Complex research, difficult code, nuanced judgment |

### models.json

```json
{
  "tiers": {
    "micro":    "claude-3-5-haiku-20241022",
    "small":    "claude-3-5-haiku-20241022",
    "medium":   "claude-3-5-sonnet-20241022",
    "standard": "claude-3-5-sonnet-20241022",
    "strong":   "claude-opus-4-5"
  },
  "agents": {
    "programmer": {
      "primary": "claude-opus-4-5",
      "fallbacks": ["claude-3-5-sonnet-20241022", "gpt-4o"]
    },
    "summarizer": {
      "primary": "claude-3-5-haiku-20241022"
    }
  }
}
```

### Usage

```typescript
import {
  getModelForTier,
  getModelForAgent,
  getFallbackChain,
  estimateCost,
} from "@agentic/config";

// Get model ID for a tier
const model = getModelForTier("standard");
// → "claude-3-5-sonnet-20241022"

// Get model for a specific agent type
const codeModel = getModelForAgent("programmer");
// → "claude-opus-4-5" (from agents config)

// Get the full fallback chain for an agent
const chain = getFallbackChain("programmer");
// → ["claude-opus-4-5", "claude-3-5-sonnet-20241022", "gpt-4o"]

// Estimate cost
const cost = estimateCost("claude-3-5-sonnet-20241022", 1000, 500);
// → 0.0105 (USD)
```

---

## API Keys

Keys are loaded from (highest priority first):

1. Plural env vars: `ANTHROPIC_API_KEYS=sk-a,sk-b,sk-c`
2. Config file: `~/.agent/config/secrets/keys.json`
3. Single env vars: `ANTHROPIC_API_KEY=sk-a`

### secrets/keys.json

```json
{
  "anthropic": {
    "keys": [
      { "key": "sk-ant-xxx", "label": "primary" },
      { "key": "sk-ant-yyy", "label": "backup" }
    ],
    "strategy": "sticky-failover"
  },
  "openai": {
    "keys": [
      { "key": "sk-zzz", "label": "key-1" }
    ],
    "strategy": "sticky-failover"
  }
}
```

Simple array format also supported:
```json
{
  "anthropic": ["sk-ant-xxx", "sk-ant-yyy"],
  "openai": ["sk-zzz"]
}
```

### Usage

```typescript
import { loadKeyConfig, getFirstKey, hasKeyForProvider, buildKeyConfig } from "@agentic/config";

// Load all keys (also injects first key of each provider into process.env)
const keys = loadKeyConfig();
// keys.anthropic → { keys: [...], strategy: "sticky-failover" }

// Get the first key for a provider
const key = getFirstKey("anthropic");
// → "sk-ant-xxx"

// Check if a provider is configured
if (!hasKeyForProvider("openai")) {
  console.warn("OpenAI not configured — some features unavailable");
}

// Build a KeyConfig from plain objects (useful for testing or injection)
const keys2 = buildKeyConfig({
  anthropic: "sk-ant-xxx",
  openai: ["sk-1", "sk-2"],
});
```

### Environment Variables

| Provider | Single key | Plural keys |
|----------|-----------|-------------|
| `anthropic` | `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEYS` |
| `openai` | `OPENAI_API_KEY` | `OPENAI_API_KEYS` |
| `openrouter` | `OPENROUTER_API_KEY` | `OPENROUTER_API_KEYS` |
| `openai-codex` | `OPENAI_CODEX_TOKEN` | `OPENAI_CODEX_TOKENS` |
| Any provider | `{PROVIDER}_API_KEY` | — |

---

## Agent Identity

### identity.json

```json
{
  "bot": {
    "name": "MyBot",
    "id": "mybot"
  },
  "owner": {
    "name": "Alice",
    "id": "alice",
    "discordId": "123456789012345678"
  }
}
```

### Usage

```typescript
import {
  loadIdentityConfig,
  getBotName,
  getOwnerName,
  getBotMentionNames,
  buildIdentityConfig,
} from "@agentic/config";

// Load from file
const identity = loadIdentityConfig();
// → { bot: { name: "MyBot", id: "mybot" }, owner: { name: "Alice", ... } }

// Quick accessors
console.log(getBotName());   // "MyBot"
console.log(getOwnerName()); // "Alice"

// Get all names the bot responds to (for mention detection)
const names = getBotMentionNames();
// → ["mybot", "MyBot"]  (also includes AGENT_NAME env var if set)

// Build from a plain object (no file I/O)
const id = buildIdentityConfig({ bot: { name: "TestBot" } });
```

---

## Runtime Config (agent.json)

Optional runtime settings for the agent server:

```json
{
  "server": { "port": 9420 },
  "gateway": {
    "port": 18789,
    "auth": { "token": "secret-token" }
  },
  "circuitBreaker": {
    "failureThreshold": 3,
    "cooldownMinutes": 5,
    "windowMinutes": 10,
    "enabled": true
  }
}
```

```typescript
import { loadRuntimeConfig, getServerPort, getGatewayConfig } from "@agentic/config";

const port = getServerPort(9420);   // falls back to 9420 if not set
const gw = getGatewayConfig();      // { port: 18789, token: "..." }
```

---

## Config Directory Resolution

```typescript
import { getConfigDir, getSecretsDir, loadConfigFile } from "@agentic/config";

// The resolved config dir (respects AGENT_CONFIG_DIR env var)
const dir = getConfigDir();
// or with an explicit override:
const dir2 = getConfigDir("/path/to/my-agent/config");

// Load any JSON file from the config dir
const discord = loadConfigFile<DiscordConfig>("discord.json");
```

---

## Validation

```typescript
import { validateAllConfigs, printValidationResults } from "@agentic/config";

const result = validateAllConfigs();

if (!result.valid) {
  printValidationResults(result);
  process.exit(1);
}
```

Sample output:
```
=== Config Validation ===

✓ models.json
✓ identity.json
⚠ secrets/keys.json
  Warnings:
    - File does not exist (optional — use env vars instead)

Secrets:
  API keys: ✗ missing

✗ Some configs have errors
```

---

## Loading Config Three Ways

### 1. From files (default)

```typescript
import { loadModelsConfig, loadKeyConfig, loadIdentityConfig } from "@agentic/config";

// Uses ~/.agent/config/ by default
const models = loadModelsConfig();
const keys = loadKeyConfig();
const identity = loadIdentityConfig();
```

### 2. From environment variables

```typescript
// Set AGENT_CONFIG_DIR, ANTHROPIC_API_KEY, etc. in the shell or .env file
// Then load normally — env vars are automatically picked up

process.env.AGENT_CONFIG_DIR = "/etc/myagent";
process.env.ANTHROPIC_API_KEY = "sk-ant-...";

const models = loadModelsConfig();  // reads from /etc/myagent/models.json
const keys = loadKeyConfig();       // reads ANTHROPIC_API_KEY from env
```

### 3. From plain JS objects

```typescript
import { mergeModelsConfig, buildKeyConfig, buildIdentityConfig } from "@agentic/config";

// Models: merge partial config with defaults
const models = mergeModelsConfig({
  tiers: {
    micro:    "gpt-4o-mini",
    small:    "gpt-4o-mini",
    medium:   "gpt-4o",
    standard: "gpt-4o",
    strong:   "gpt-4o",
  },
});

// Keys: build from plain object
const keys = buildKeyConfig({
  openai: process.env.OPENAI_API_KEY!,
});

// Identity: build from partial object
const identity = buildIdentityConfig({
  bot: { name: "MyBot", id: "mybot" },
});
```

---

## Model Cost Data

Built-in cost data for common models (USD per million tokens):

| Model | Input | Output | Cache Write | Cache Read |
|-------|-------|--------|-------------|------------|
| claude-3-5-haiku-20241022 | $0.80 | $4.00 | $1.00 | $0.08 |
| claude-3-5-sonnet-20241022 | $3.00 | $15.00 | $3.75 | $0.30 |
| claude-3-opus-20240229 | $15.00 | $75.00 | $18.75 | $1.50 |
| gpt-4o | $5.00 | $15.00 | — | — |
| gpt-4o-mini | $0.15 | $0.60 | — | — |

```typescript
import { estimateCost, getModelDefinition } from "@agentic/config";

// Estimate cost of a call
const usd = estimateCost("claude-3-5-sonnet-20241022", 10_000, 2_000);
// → $0.06

// Get full model metadata
const def = getModelDefinition("claude-3-5-haiku-20241022");
// → { id, name, provider, tier, cost, context }
```

---

## License

MIT
