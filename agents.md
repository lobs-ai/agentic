# agents.md — Agentic

## What It Is

Agentic is a TypeScript monorepo providing **tool abstractions** for agent runtimes — file editing, shell execution, search, and code exploration — with a focus on **safety, deduplication, and extensibility**. It is NOT an LLM wrapper; it runs without external AI calls and exposes a clean tool interface.

## Ecosystem Role

Provides the tool layer that lobs-core uses for file operations, shell commands, and code search. The runner package can launch agentic workflows from the CLI.

**Key packages:**
- `packages/runner` — CLI tool launcher; entry point for running tools
- `packages/memory` — vector + knowledge-graph memory store with Q/A retrieval
- `packages/tools` — file tools (Read, Write, Edit, Grep, Glob, Bash) with safety checks
- `packages/prompt-system` — per-tool prompt contributions (`getSystemPromptSection()`)

## Build & Run

```bash
cd agentic
npm install
npm run build        # build all packages
npm run test         # run tests

# Or per-package:
cd packages/runner && npx ts-node src/index.ts
cd packages/memory && npm run embed -- "your text here"   # test embedding
```

**Requirements:** Node.js 18+, TypeScript 5+, `牙` CLI (from lobs-core for tool invocation)

## Key Conventions

- **Safety validation before execution** — Read/Edit validate inputs (blocked device paths, staleness via mtime, binary files) before running
- **Per-tool prompts** — tools export `getSystemPromptSection()` to contribute to system prompt
- **Deduplication** — Read uses mtime cache + stub pattern (same as Claude Code); duplicate reads within same session return cached stubs
- **Zod schemas** — Tool input/output schemas use Zod v4 for typed validation
- **Staleness detection** — Edit checks that the file wasn't modified between Read and Edit (mtime gap)
- **Quote normalization** — Edit normalizes curly quotes to straight when matching `old_string`

## Important Patterns

**Adding a new tool:**
1. Create `packages/tools/src/my-tool/` directory
2. Implement `inputSchema` (Zod) and `outputSchema` (Zod)
3. Export `getSystemPromptSection()` for system prompt contribution
4. Add safety checks in `validateInput()` before execution
5. Register in the tools index

**Tool prompt pattern:**
```typescript
export function getSystemPromptSection(): string {
  return `## MyTool\n\nDescribe what it does and when to use it...`;
}
```

**Memory Q/A retrieval:**
```typescript
import { retrieve } from './packages/memory/dist/';
const results = await retrieve(query, { topK: 5 });
```

**Safety checks (already built-in for Read/Edit):**
- Blocked device paths: `/dev/zero`, `/dev/random`, `/dev/stdin`, etc.
- Binary file detection: extension list + null-byte scan
- Edit staleness: mtime must match between Read and Edit
- Quote normalization: curly → straight in Edit `old_string` matching

## File Layout

```
packages/
  runner/        — CLI tool launcher
  memory/       — vector + knowledge-graph store
  tools/        — file tools (read, write, edit, grep, glob, bash)
  prompt-system/ — per-tool prompt contributions
```

## Notes

- This repo is primarily consumed by lobs-core, not run standalone
- The runner is a CLI wrapper around the tool layer
- Memory package uses a hybrid vector + knowledge-graph approach (not pure embeddings)
