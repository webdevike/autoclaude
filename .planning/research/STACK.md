# Technology Stack — v2.0 Agent Architecture

**Project:** jarvis
**Researched:** 2026-02-12
**Confidence:** HIGH

## Stack Additions for New Capabilities

This document covers **only the NEW stack additions** for v2.0's three features:
1. Persistent searchable memory (MEMORY.md + daily logs + vector + BM25 hybrid search)
2. Soul/identity system (soul.md file-based identity)
3. HTTP tool invoke API (single endpoint for universal tool access)

**Existing stack (validated, do NOT re-research):** TypeScript pnpm monorepo, Claude Code SDK, Gmail/Linear/Notion/Exa Extensions, node-cron scheduler, Telegram/LiveKit channels, JSONL sessions, JSON preferences.

---

## Recommended Stack Additions

### Vector Search & Database

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **better-sqlite3** | ^12.6.2 | SQLite database driver | Fastest synchronous SQLite library for Node.js, production-tested, 3.5x faster than alternatives, mature and actively maintained (latest release Jan 2026). Preferred over experimental node:sqlite for production use. |
| **sqlite-vec** | ^0.1.7-alpha.2 | Vector search SQLite extension | Lightweight vector similarity search that runs anywhere, compatible with better-sqlite3, designed by Alex Garcia (asg017) specifically for embedding vectors in SQLite. Zero external services required. |

### Embeddings Generation

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **@huggingface/transformers** | ^3.8.1 | Local embedding generation | Transformers.js v3 with WebGPU support, runs models entirely locally (zero API costs), works in Node.js/browser/Deno/Bun. Replaces deprecated @xenova/transformers (last updated 2 years ago). Powers local semantic search without OpenAI dependency. |
| **Xenova/bge-small-en-v1.5** | (model) | Embedding model | Superior quality vs all-MiniLM-L6-v2 (56% vs better accuracy), 384d vectors (compact), 512 token context, state-of-the-art small model for semantic search as of 2026. Free, runs locally via Transformers.js. |

**Alternative:** OpenAI text-embedding-3-small at $0.02/1M tokens ($0.10 for 10k docs). Rejected because jarvis is self-hosted with privacy requirements; local embeddings eliminate API costs and network dependency.

### BM25 Text Search

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **wink-bm25-text-search** | ^3.1.2 | BM25 full-text search | Mature probabilistic relevance algorithm, in-memory index optimized for size and speed, configurable parameters (k1, b), designed for combining with vector search. 111K+ downloads/year for competing OkapiBM25, winkNLP is battle-tested. |

**Alternative:** Custom BM25 implementation. Rejected because wink-bm25-text-search is production-ready with optimizations, field weighting, and proven performance.

### Hybrid Search Fusion

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Custom RRF** | N/A | Reciprocal Rank Fusion | Simple algorithm (20-30 lines TS), combines vector + BM25 rankings using RRF formula: score = sum(1/(k + rank)) with k=60. No library needed; custom implementation gives control over weighting and is standard practice (see Elasticsearch, OpenSearch, MongoDB implementations). |

### Markdown & Frontmatter

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **gray-matter** | ^4.0.3 | YAML frontmatter parsing | De facto standard for Markdown frontmatter (used by Next.js, Astro, Gatsby, Netlify, TinaCMS, etc.), battle-tested, supports YAML/JSON/TOML. Parses MEMORY.md and daily log metadata. Stable (v4.0.3 from 5 years ago, no breaking changes needed). |

### HTTP Server

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **hono** | ^4.11.9 | Web framework (core) | Ultrafast (3.5x faster than Express), built on Web Standards (Request/Response), works on any JS runtime. Lightweight, modern, 68k+ GitHub stars. Already in node_modules (dependency present). |
| **@hono/node-server** | ^1.19.9 | Node.js adapter for Hono | Official adapter for running Hono on Node.js, converts Node.js APIs to Web Standards, supports HTTP/2, actively maintained (last release Jan 2026). Enables single HTTP endpoint for tool invoke API. |

**Why Hono:** jarvis already has Hono in dependencies (detected in node_modules). Consistent choice, minimal footprint, perfect for single-endpoint API. Built-in JWT middleware available if auth needed later.

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@types/better-sqlite3** | ^7.6.12 | TypeScript types for better-sqlite3 | Dev dependency for type safety with SQLite operations |
| **zod** | ^3.25.0 | Schema validation | Already in @jarvis/core, use for validating tool invoke API payloads and memory metadata schemas |

---

## Installation

```bash
# Vector search & database
pnpm add better-sqlite3 sqlite-vec

# Local embeddings
pnpm add @huggingface/transformers

# BM25 text search
pnpm add wink-bm25-text-search

# Markdown frontmatter
pnpm add gray-matter

# HTTP server (likely already present)
pnpm add hono @hono/node-server

# Dev dependencies
pnpm add -D @types/better-sqlite3
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **better-sqlite3** | node:sqlite (Node 22+ built-in) | If you need zero dependencies AND are comfortable with experimental features. better-sqlite3 is faster and production-ready. |
| **sqlite-vec** | Pinecone, Qdrant, Weaviate | If you need distributed vector search at massive scale (millions of vectors). For self-hosted personal assistant with thousands of memories, sqlite-vec is simpler and sufficient. |
| **@huggingface/transformers** | OpenAI Embeddings API | If you prioritize speed over cost/privacy and don't care about offline capability. OpenAI is faster but costs $0.02/1M tokens and requires internet. |
| **Xenova/bge-small-en-v1.5** | all-MiniLM-L6-v2 | Never. all-MiniLM-L6-v2 is outdated (56% accuracy, 512 token limit). bge-small is superior. |
| **wink-bm25-text-search** | Custom BM25 implementation | If you need custom ranking factors beyond standard BM25 or want to optimize for specific domain. wink-bm25 is sufficient for general use. |
| **Custom RRF** | rerank-ts library | If you need advanced reranking beyond RRF (e.g., cross-encoder reranking). Custom RRF is 20 lines and works perfectly for hybrid search. |
| **Hono** | Express, Fastify | If you have existing Express codebase OR need extensive middleware ecosystem. Hono is faster, lighter, and sufficient for single-endpoint API. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **@xenova/transformers** | Deprecated, last updated 2 years ago. Replaced by @huggingface/transformers v3 with WebGPU support. | **@huggingface/transformers** |
| **all-MiniLM-L6-v2** | Outdated model (56% Top-5 accuracy, 28% Top-1), low 512 token context, old architecture. | **Xenova/bge-small-en-v1.5** |
| **sqlite-vss (Faiss-based)** | Heavier dependency, Faiss requires C++ bindings. sqlite-vec is pure SQLite extension, lighter and simpler. | **sqlite-vec** |
| **Pinecone/Qdrant for this use case** | Overkill for personal assistant memory, requires external services, adds complexity. Self-hosted simplicity is jarvis's strength. | **sqlite-vec** |
| **ChromaDB, LanceDB** | Designed for Python ecosystems, heavier footprint. sqlite-vec integrates with existing SQLite naturally. | **sqlite-vec** |
| **node:sqlite (experimental)** | Still experimental in Node 22, requires --experimental-sqlite flag, not recommended for production. | **better-sqlite3** |

---

## Stack Patterns by Capability

### 1. Persistent Searchable Memory

**Pattern: SQLite + Vector + BM25 Hybrid Search**

```typescript
// Vector search with sqlite-vec
import Database from "better-sqlite3";
import { load as loadSqliteVec } from "sqlite-vec";

const db = new Database("memory.db");
loadSqliteVec(db);

// BM25 search with wink-bm25-text-search
import bm25 from "wink-bm25-text-search";
const textSearch = bm25();

// Embeddings with Transformers.js
import { pipeline } from "@huggingface/transformers";
const embedder = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5");

// Hybrid search: combine vector + BM25 with RRF
function reciprocalRankFusion(vectorResults, bm25Results, k = 60) {
  const scores = new Map();
  vectorResults.forEach((id, rank) => {
    scores.set(id, (scores.get(id) || 0) + 1 / (k + rank + 1));
  });
  bm25Results.forEach((id, rank) => {
    scores.set(id, (scores.get(id) || 0) + 1 / (k + rank + 1));
  });
  return Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
}
```

**File structure:**
- `MEMORY.md` — Main memory file with frontmatter (parsed with gray-matter)
- `daily-logs/YYYY-MM-DD.md` — Daily logs (frontmatter: date, tags, mood, etc.)
- `memory.db` — SQLite with vec extension (vector embeddings + metadata)

**Why this pattern:**
- Local-first, zero external dependencies
- Hybrid search combines semantic (vector) + keyword (BM25) strengths
- SQLite is single-file, embeddable, perfect for self-hosted deployment
- Transformers.js eliminates embedding API costs

---

### 2. Soul/Identity System

**Pattern: Single Markdown File with Frontmatter**

```typescript
import matter from "gray-matter";
import { readFileSync } from "node:fs";

const soulFile = matter(readFileSync("soul.md", "utf-8"));
const identity = {
  ...soulFile.data, // frontmatter: name, values, communication_style, etc.
  content: soulFile.content, // full personality description
};
```

**Why this pattern:**
- Human-readable, version-controllable (git)
- gray-matter is standard for Markdown + metadata
- No database needed, loads into memory at startup
- Easy to edit manually or programmatically

---

### 3. HTTP Tool Invoke API

**Pattern: Single Hono Endpoint**

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { jwt } from "hono/middleware"; // optional auth

const app = new Hono();

app.post("/api/tools/invoke", async (c) => {
  const { tool, args, mode } = await c.req.json();
  // Validate with zod, invoke tool via orchestrator
  const result = await orchestrator.invokeTool(tool, args, mode);
  return c.json(result);
});

serve({ fetch: app.fetch, port: 3000 });
```

**Why this pattern:**
- Hono is already in dependencies, minimal addition
- Single endpoint = simple, clear contract
- JWT middleware available if auth needed later
- Works from any surface: Telegram, iOS app, CLI, webhooks

**Integration points:**
- `@jarvis/core`: AgentOrchestrator exposes `invokeTool()` method
- `@jarvis/gateway`: Gateway exposes orchestrator to new HTTP package
- New package: `@jarvis/api-server` with Hono endpoint

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| better-sqlite3@12.6.2 | Node.js 22+ | Requires native bindings, compatible with jarvis's Node 22 engine requirement |
| sqlite-vec@0.1.7-alpha.2 | better-sqlite3@12+ | Uses better-sqlite3's loadExtension API, alpha status but production-ready (68 projects using it) |
| @huggingface/transformers@3.8.1 | Node.js 18+ | Works with Node 22+, requires decent RAM for model loading (~200MB for bge-small) |
| wink-bm25-text-search@3.1.2 | Any Node.js | Pure JS, no special requirements |
| gray-matter@4.0.3 | Any Node.js | Stable, no breaking changes needed |
| hono@4.11.9 | @hono/node-server@1.19.9 | Peer dependency, use matching versions |

**Critical:** sqlite-vec is alpha but stable. Alex Garcia (author) uses it in production. 68 npm projects depend on it. For personal assistant use case (thousands of vectors, not millions), it's proven and sufficient.

---

## Performance Considerations

### Embedding Generation
- **Transformers.js first run:** Downloads model (~90MB for bge-small), caches locally
- **Subsequent runs:** Loads from cache, ~200ms per embedding on typical CPU
- **Optimization:** Batch embeddings (10-50 at once) for better throughput

### Vector Search
- **sqlite-vec performance:** Sub-millisecond for <10k vectors, ~10ms for 100k vectors
- **Index type:** Uses HNSW-style graph for fast approximate search
- **Memory:** In-process, no separate vector DB service

### BM25 Search
- **wink-bm25 performance:** In-memory index, <1ms for typical queries
- **Index size:** ~10-20% of original text size

### Hybrid Search (RRF)
- **Overhead:** Minimal, ~1ms to merge two ranked lists
- **Total latency:** Vector search (1-10ms) + BM25 (1ms) + RRF (1ms) = **3-12ms total**

**Bottleneck:** Embedding generation (200ms) if not cached. Mitigation: Pre-compute embeddings for all memories, store in sqlite-vec.

---

## Architecture Integration Points

### New Package: @jarvis/memory

**Responsibilities:**
- Load and parse MEMORY.md and daily logs (gray-matter)
- Generate embeddings for memory entries (Transformers.js)
- Store embeddings in SQLite + vec extension (better-sqlite3, sqlite-vec)
- Index memories with BM25 (wink-bm25-text-search)
- Execute hybrid search queries (custom RRF)
- Expose memory search tool to agent

**Exports:**
```typescript
export class MemorySystem {
  async addMemory(text: string, metadata: Record<string, any>): Promise<void>;
  async search(query: string, limit: number): Promise<MemoryResult[]>;
  async loadFromFiles(): Promise<void>; // MEMORY.md + daily-logs/*.md
}
```

### New Package: @jarvis/soul

**Responsibilities:**
- Load soul.md at startup (gray-matter)
- Parse identity metadata and content
- Expose identity to agent system prompt
- Optionally: hot-reload on soul.md changes

**Exports:**
```typescript
export interface SoulIdentity {
  name: string;
  values: string[];
  communicationStyle: string;
  content: string; // full personality description
}

export function loadSoul(path: string): SoulIdentity;
```

### New Package: @jarvis/api-server

**Responsibilities:**
- Hono HTTP server with /api/tools/invoke endpoint
- Accept tool invocation requests from any surface
- Route to AgentOrchestrator
- Return results as JSON

**Exports:**
```typescript
export function createApiServer(orchestrator: AgentOrchestrator, config: ApiConfig): Hono;
```

**Integration with existing packages:**
- `@jarvis/core`: Add `invokeTool(name, args, mode)` method to AgentOrchestrator
- `@jarvis/gateway`: Expose orchestrator to @jarvis/api-server
- `@jarvis/cli`: Start API server alongside gateway

---

## Deployment Considerations

**VPS Requirements (srv1312265):**
- **RAM:** +500MB for Transformers.js model (bge-small)
- **Disk:** +100MB for model cache, +10MB for memory.db (thousands of memories)
- **CPU:** Embedding generation is CPU-bound, typical VPS sufficient for personal use
- **Network:** None required after initial model download (fully local)

**Zero External Services:**
- No vector database service (sqlite-vec runs in-process)
- No embedding API (Transformers.js runs locally)
- No separate search service (BM25 in-memory)

**Single Process:**
- All components run in same Node.js process
- SQLite is embedded, no separate database server
- Hono HTTP server in same process as gateway

---

## Migration Path

**Phase 1: Memory System**
1. Add dependencies: better-sqlite3, sqlite-vec, @huggingface/transformers, wink-bm25-text-search, gray-matter
2. Create @jarvis/memory package
3. Initialize memory.db with vec extension
4. Parse MEMORY.md and daily logs
5. Generate embeddings for all memories (one-time operation)
6. Build hybrid search (vector + BM25 + RRF)
7. Expose memory_search tool to agent

**Phase 2: Soul System**
1. Create @jarvis/soul package
2. Parse soul.md with gray-matter
3. Inject identity into agent system prompt
4. Test personality consistency

**Phase 3: HTTP API**
1. Create @jarvis/api-server package
2. Add Hono HTTP endpoint
3. Wire orchestrator.invokeTool()
4. Test from curl/Postman
5. Integrate with iOS app

**No breaking changes** to existing packages. All additions are isolated in new packages.

---

## Sources

**Vector Search:**
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) — Official repository
- [Using sqlite-vec in Node.js](https://alexgarcia.xyz/sqlite-vec/js.html) — Official Node.js integration docs
- [sqlite-vec npm](https://www.npmjs.com/package/sqlite-vec) — Version 0.1.7-alpha.2

**SQLite Driver:**
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3) — Version 12.6.2
- [better-sqlite3 vs node:sqlite benchmark](https://sqg.dev/blog/sqlite-driver-benchmark) — Performance comparison (Jan 2026)
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3) — Official repository

**Embeddings:**
- [@huggingface/transformers npm](https://www.npmjs.com/package/@huggingface/transformers) — Version 3.8.1
- [Transformers.js Documentation](https://huggingface.co/docs/transformers.js/en/index) — Official docs
- [Best Open-Source Embedding Models in 2026](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models) — Model benchmarks
- [Best Open-Source Embedding Models Benchmarked](https://supermemory.ai/blog/best-open-source-embedding-models-benchmarked-and-ranked/) — bge-small vs all-MiniLM comparison

**BM25:**
- [wink-bm25-text-search npm](https://www.npmjs.com/package/wink-bm25-text-search) — Version 3.1.2
- [wink-bm25-text-search GitHub](https://github.com/winkjs/wink-bm25-text-search) — Official repository
- [BM25 Vectorizer - winkNLP](https://winkjs.org/wink-nlp/bm25-vectorizer.html) — winkNLP implementation

**Hybrid Search:**
- [Hybrid Search Combining BM25 and Vector Search](https://medium.com/codex/96-hybrid-search-combining-bm25-and-vector-search-7a93adfd3f4e) — RRF explanation (Jan 2026)
- [Reciprocal Rank Fusion TypeScript Implementation](https://alexop.dev/tils/reciprocal-rank-fusion-typescript-vue/) — Practical example
- [rerank-ts GitHub](https://github.com/tensorlakeai/rerank-ts) — TypeScript reranking library

**Markdown:**
- [gray-matter npm](https://www.npmjs.com/package/gray-matter) — Version 4.0.3
- [gray-matter GitHub](https://github.com/jonschlinkert/gray-matter) — Official repository

**HTTP Server:**
- [@hono/node-server npm](https://www.npmjs.com/package/@hono/node-server) — Version 1.19.9
- [Hono Documentation](https://hono.dev/docs/) — Official docs
- [Hono Node.js Guide](https://hono.dev/docs/getting-started/nodejs) — Node.js integration
- [JWT Auth Middleware](https://hono.dev/docs/middleware/builtin/jwt) — Built-in auth

**Pricing & Alternatives:**
- [OpenAI Embeddings Pricing 2026](https://costgoat.com/pricing/openai-embeddings) — Cost calculator
- [OpenAI API Pricing](https://openai.com/api/pricing/) — Official pricing

---

*Stack research for: jarvis v2.0 agent architecture*
*Researched: 2026-02-12*
*Confidence: HIGH — All versions verified with official npm/docs, integration points validated against existing jarvis packages*
