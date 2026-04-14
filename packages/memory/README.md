# @agentic/memory

Memory and knowledge system for AI agents — persist, search, and learn across sessions.

## Overview

`@agentic/memory` gives agents the ability to remember things between sessions. It provides:

- **Typed memory entries** — learnings, decisions, patterns, preferences, facts, and document chunks
- **Two storage backends** — a simple file-based store (markdown + JSON) and a SQLite store with FTS5 and optional vector search
- **Automatic extraction** — LLM-powered extraction of candidate memories from agent conversations
- **File indexing** — index markdown/text files as searchable document chunks
- **Abstract interfaces** — swap backends without changing your agent code

The philosophy: memory should capture things a fresh agent instance _needs to know_ that it can't re-derive from code, docs, or git history. Most sessions produce 0–2 memories. Quality over quantity.

---

## Installation

```bash
npm install @agentic/memory better-sqlite3
npm install -D @types/better-sqlite3
```

---

## Memory Types

| Type | When to use |
|------|-------------|
| `learning` | Discovered through experience: debugging insights, API quirks, what worked and didn't |
| `decision` | An explicit, ongoing choice: architecture, approach, tool selection — and WHY |
| `pattern` | Recurring behaviour worth recognising across sessions |
| `preference` | A durable user preference about how things should work _going forward_ |
| `fact` | Concrete, durable fact: project structure, key people, URLs, configurations |
| `document` | A chunk of an indexed file (markdown, notes, etc.) — auto-managed by `FileIndexer` |

### Memory Entry Shape

```ts
interface MemoryEntry {
  id:              string | number;   // store-assigned
  memoryType:      MemoryType;
  title:           string;            // 3-8 words
  content:         string;            // 1-4 sentences
  confidence:      number;            // [0, 1]
  scope:           MemoryScope;       // 'system' | 'agent' | 'session'
  sourceAuthority: 0 | 1;             // 0=extracted, 1=explicitly stated
  status:          MemoryStatus;      // 'active' | 'superseded' | 'archived'
  derivedAt:       string;            // ISO timestamp
  accessCount:     number;
  projectId?:      string;
  collection?:     string;
  sourcePath?:     string;            // for document chunks
  chunkIndex?:     number;
  contentHash?:    string;
}
```

---

## Storage Backends

### FileMemoryStore (simple, zero-deps)

Stores memories as a JSON index + human-readable markdown files. No native binaries required.

```ts
import { FileMemoryStore } from '@agentic/memory';

const store = new FileMemoryStore('~/.agent/memory');

// Write a memory
await store.write({
  memoryType:      'learning',
  title:           'Rate limiting workaround',
  content:         'Always add 200ms delay between calls to avoid 429s. Exponential backoff helps.',
  confidence:      0.9,
  scope:           'system',
  sourceAuthority: 1,
  status:          'active',
});

// Search
const results = await store.search('API rate limits');

// Read a file (returns line-numbered text)
const text = await store.read('~/notes/api-notes.md', { from: 10, lines: 20 });

// List with filters
const decisions = await store.list({
  memoryTypes: ['decision', 'learning'],
  minConfidence: 0.7,
  limit: 20,
});
```

**Layout on disk:**
```
~/.agent/memory/
  entries.json           ← all entries (queryable index)
  daily/
    2026-04-14.md        ← today's entries (human-readable)
  permanent/
    learnings.md
    decisions.md
    facts.md
    ...
```

### SqliteMemoryStore (recommended for production)

SQLite with FTS5 full-text search and optional vector similarity reranking. Requires `better-sqlite3`.

```ts
import { SqliteMemoryStore } from '@agentic/memory';

const store = new SqliteMemoryStore('~/.agent/memory.db');

// Same write/search/list/read interface as FileMemoryStore
await store.write({ ... });
const results = await store.search('rate limits');

// With a pre-computed query embedding (for vector reranking)
const queryVec = await getEmbedding('rate limits');
const reranked = await store.searchWithEmbedding('rate limits', queryVec, { maxResults: 10 });

// Stats
console.log(store.getStats());
// { total: 142, active: 138, withEmbeddings: 98, byType: { learning: 40, ... } }

store.close();
```

**Search modes:**
- **FTS5** (always available) — fast full-text BM25 ranking
- **Vector reranking** (when embeddings stored) — cosine similarity over stored vectors
- **Hybrid** — combines FTS rank + vector similarity with configurable weights

---

## Search Options

```ts
const results = await store.search('deployment pipeline', {
  maxResults:        10,        // default: 10
  memoryTypes:       ['decision', 'learning'],
  scope:             'system',
  projectId:         'my-project',
  minConfidence:     0.6,       // default: 0.3
  includeSuperseded: false,     // default: false
  includeDocuments:  true,      // default: true
  collections:       ['docs'],
});

// Each result:
// { entry: MemoryEntry, score: number, matchType: 'fts' | 'vector' | 'hybrid' | 'keyword' }
```

---

## Memory Extraction

Use the extractor to automatically pull candidate memories from agent conversations:

```ts
import { extractMemories, extractMemoriesFromText } from '@agentic/memory';
import type { LlmCaller } from '@agentic/memory';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Implement the LlmCaller interface with any model
const callLlm: LlmCaller = async (system, user) => {
  const resp = await anthropic.messages.create({
    model:      'claude-haiku-4-5',
    system,
    messages:   [{ role: 'user', content: user }],
    max_tokens: 2048,
  });
  return resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
};

// Extract from plain text
const candidates = await extractMemoriesFromText(sessionTranscript, callLlm, {
  agentName:    'My Agent',
  ownerName:    'Alice',
  agentContext: 'A research assistant working on ML papers.',
});

// Store candidates that meet quality thresholds
for (const candidate of candidates) {
  const entry = await store.writeCandidate?.(candidate);
  if (entry) console.log(`Stored: ${entry.title}`);
}
```

### Structured event extraction

For richer extraction, provide structured event clusters:

```ts
import { extractMemories } from '@agentic/memory';
import type { EventCluster } from '@agentic/memory';

const cluster: EventCluster = {
  priority: 'high',
  reason:   'user stated a new preference',
  events: [
    {
      id:          1,
      eventType:   'user_input',
      content:     "Don't send me Discord notifications for low-priority tasks.",
      timestamp:   new Date().toISOString(),
      signalScore: 0.9,
    },
    {
      id:          2,
      eventType:   'agent_output',
      content:     "Got it — I'll only ping you for high-priority items.",
      timestamp:   new Date().toISOString(),
      signalScore: 0.6,
    },
  ],
};

const candidates = await extractMemories(cluster, callLlm, { agentName: 'My Agent' });
```

---

## File Indexing

Index markdown and text files as searchable document chunks:

```ts
import { FileIndexer, SqliteMemoryStore } from '@agentic/memory';

const store   = new SqliteMemoryStore('~/.agent/memory.db');
const indexer = new FileIndexer(store, {
  watchDirs: [
    { path: '~/docs',   collection: 'docs',   recursive: true },
    { path: '~/notes',  collection: 'notes',  recursive: false },
  ],
  chunkStrategy:    'heading',   // 'heading' (default) or 'fixed'
  maxChunkTokens:   400,
  rescanIntervalMs: 900_000,     // 15 minutes

  // Optional: enable vector embeddings
  embedUrl:   'http://localhost:1234/v1/embeddings',
  embedModel: 'text-embedding-ada-002',
  batchSize:  10,
});

indexer.start();
// ... later
indexer.stop();

// Check progress
console.log(indexer.getStats());
// { files: 42, chunks: 318, pendingEmbeddings: 0 }
```

**Chunking strategies:**
- `heading` (default) — splits on `##`/`###` markdown headings, then by paragraph if a section is too large
- `fixed` — fixed-size chunks with 20% overlap (for non-markdown or headingless files)

---

## Utilities

### Vector search helpers

```ts
import { cosineSimilarity, fetchEmbedding } from '@agentic/memory';

// Compute cosine similarity between two embedding vectors
const sim = cosineSimilarity(vecA, vecB); // -1 to 1

// Fetch an embedding from any OpenAI-compatible endpoint
const vec = await fetchEmbedding(
  'deployment pipeline',
  'http://localhost:1234/v1/embeddings',
  'text-embedding-ada-002',
);
```

### Keyword search (in-memory fallback)

```ts
import { keywordSearch } from '@agentic/memory';

// Search an in-memory array of MemoryEntry objects
const results = keywordSearch('rate limits', allEntries, { maxResults: 5 });
```

### File grep (no store required)

```ts
import { grepFiles } from '@agentic/memory';

const hits = grepFiles('deployment pipeline', ['~/docs', '~/notes'], 10);
// [{ path, startLine, endLine, score, snippet }, ...]
```

### Scoring

```ts
import { importanceScore, decayedConfidence } from '@agentic/memory';

// Combined importance (type bias + source authority + access count)
const importance = importanceScore(entry); // [0, 1]

// Confidence with time-based decay (except 'fact' type — never decays)
const conf = decayedConfidence(entry); // [0, 1]
```

---

## Custom MemoryStore Backend

Implement the `MemoryStore` interface to add your own backend (PostgreSQL, Redis, a remote API, etc.):

```ts
import type { MemoryStore, MemoryWriteInput, MemoryEntry, SearchResult } from '@agentic/memory';

class MyCustomStore implements MemoryStore {
  async write(input: MemoryWriteInput): Promise<MemoryEntry> {
    // ... your implementation
  }

  async search(query: string): Promise<SearchResult[]> {
    // ... your implementation
  }

  async read(path: string): Promise<string> {
    // ... your implementation
  }

  async list(filter?) {
    // ... your implementation
  }
}
```

---

## Memory Quality Thresholds

Candidates extracted by the LLM are validated against per-type thresholds before being stored:

| Type | Min confidence | Min evidence events |
|------|---------------|---------------------|
| `learning` | 0.6 | 1 |
| `decision` | 0.7 | 1 |
| `pattern` | 0.5 | 2 |
| `preference` | 0.7 | 1 |
| `fact` | 0.8 | 1 |
| `document` | 0.5 | 1 |

---

## License

MIT
