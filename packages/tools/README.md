# @agentic/tools

Standalone TypeScript tool implementations for AI agents — read, write, edit, exec, grep, glob, find, and code search.

These are the same tools used in the lobs-core agent runner, extracted into a reusable package.

## Tools

| Tool | Description |
|------|-------------|
| `read` | Read file contents with line numbers, offset, and limit |
| `write` | Write/overwrite files, creates parent directories |
| `edit` | Exact find-and-replace with diff output, enforces read-before-edit |
| `exec` | Run shell commands, detects cwd changes |
| `ls` | List directory contents |
| `grep` | Search file contents via ripgrep (falls back to grep) |
| `glob` | Find files by glob pattern via fd (falls back to find) |
| `find_files` | Find files with type/extension/depth/hidden filtering |
| `code_search` | Ripgrep with context lines for code navigation |

## Install

```bash
npm install @agentic/tools
```

## Usage

### Execute a single tool

```typescript
import { readTool, execTool } from "@agentic/tools";

const content = await readTool({ file_path: "/path/to/file.ts" }, process.cwd());
const result = await execTool({ cmd: "ls -la" }, process.cwd());
```

### Use with an Anthropic agent loop

```typescript
import { ALL_TOOL_DEFINITIONS, executeTool } from "@agentic/tools";

// Pass definitions to the API
const response = await anthropic.messages.create({
  model: "claude-opus-4-5",
  tools: ALL_TOOL_DEFINITIONS,
  messages: [...],
});

// Execute tool calls
for (const block of response.content) {
  if (block.type === "tool_use") {
    const result = await executeTool(block.name, block.input, process.cwd());
    // result is a string or { result: string, sideEffects?: { newCwd?: string } }
  }
}
```

### Register a subset of tools

```typescript
import { ALL_TOOLS } from "@agentic/tools";

// Only file tools (no exec)
const fileTools = ALL_TOOLS.filter(
  (t) => !["exec", "code_search"].includes(t.definition.name)
);
```

## API

### Tool executors

Every tool has the same signature:

```typescript
async function *Tool(
  params: Record<string, unknown>,
  cwd: string
): Promise<ToolExecutorResult>
```

Where `ToolExecutorResult` is either:
- A `string` — the tool output
- `{ result: string; sideEffects?: { newCwd?: string } }` — structured result (exec uses this when `cd` changes the directory)

### Utilities

```typescript
import { capOutput, resolveToCwd } from "@agentic/tools";

// Truncate output to a safe size
capOutput(output, maxChars?, maxLines?);

// Resolve a path relative to cwd (expands ~)
resolveToCwd("~/some/path", cwd);
```

### Read snapshots

The `edit` tool enforces that a file must be read before it can be edited. This is managed via read snapshots:

```typescript
import { hasRecentlyReadFile, updateReadSnapshot } from "@agentic/tools";

hasRecentlyReadFile("/path/to/file");  // true if file was recently read
updateReadSnapshot("/path/to/file");   // update after a write
```

## Requirements

- Node.js >= 18
- `rg` (ripgrep) — for `grep` and `code_search` (falls back to system grep/find without it)
- `fd` — for `glob` and `find_files` (falls back to system find without it)

## License

MIT
