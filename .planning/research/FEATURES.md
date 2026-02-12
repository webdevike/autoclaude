# Feature Research

**Domain:** Personal AI Assistant with Persistent Memory & Identity
**Researched:** 2026-02-12
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in a personal AI assistant with memory. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **File-based persistent memory** | Industry standard (OpenClaw, Mem0, Clawdbot). Users expect "write it to memory" to create durable records. | MEDIUM | Markdown files as source of truth: `MEMORY.md` for curated facts, `memory/YYYY-MM-DD.md` for daily logs. Builds on existing JSONL session logs. |
| **Semantic memory search** | Users expect AI to "remember when I said X" across sessions. Keyword search alone fails on paraphrases. | MEDIUM | Hybrid vector + BM25 search. Vector handles "Mac Studio gateway host" → "machine running gateway", BM25 handles exact tokens (error codes, IDs). OpenClaw default: 70% vector, 30% BM25. |
| **Soul/identity file** | Users expect consistent personality across sessions. "Who are you?" should have a stable answer. | LOW | `SOUL.md` loaded at session start. Contains core truths, boundaries, vibe, continuity notes. Agent reads on wakeup, can update as it learns. |
| **Pre-compaction memory flush** | Context window overflow = data loss unless memories saved proactively. Expected to "just work". | MEDIUM | Silent turn before compaction: agent reviews conversation, extracts key facts, writes to disk. Triggers at ~75% of context limit (configurable soft threshold). |
| **Memory search tool** | If memories exist, agent must be able to retrieve them. Otherwise memory is write-only (useless). | MEDIUM | `memory_search(query)` returns snippets with file paths, line ranges, relevance scores. Capped at ~700 chars per result to avoid context bloat. |
| **Daily memory logs** | Users expect "what did we discuss yesterday?" to work. Curated memory alone is lossy. | LOW | One `memory/YYYY-MM-DD.md` file per day. Auto-loads today + yesterday at session start. Agent appends running notes. |
| **Workspace structure** | Users migrating from OpenClaw expect `~/.jarvis/workspace/` layout. Files in predictable locations. | LOW | Separation: `~/.jarvis/` for config/credentials/sessions, `~/.jarvis/workspace/` for memory/identity/agent files. Follow OpenClaw conventions. |

### Differentiators (Competitive Advantage)

Features that set jarvis apart. Not required, but valuable for specific use cases.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **HTTP tool invoke API** | Any surface (Telegram, iOS, CLI, future web) calls same tools. Single source of truth. | LOW | `POST /tools/invoke` with bearer auth. Already have Gateway HTTP+WS multiplex. OpenClaw pattern: tool name, args, optional sessionKey. Unifies MCP bridge (text) + llm.tool() (voice). |
| **Local embeddings option** | Privacy-first users want memory search without cloud API calls. Zero marginal cost. | MEDIUM | `node-llama-cpp` with `ggml-org/embeddinggemma-300M-GGUF` (~0.6 GB). Auto-downloads on first use. Fallback chain: local → OpenAI → Gemini → Voyage. |
| **Hybrid vector + BM25 with graceful degradation** | If embeddings fail (API down, quota exceeded), BM25 keyword search still works. | MEDIUM | Union retrieval: vector OR BM25 contribute to results. If embeddings unavailable, BM25-only mode. Better than total failure. |
| **Session memory indexing** | Agent can search its own session transcripts, not just curated memory. Useful for "what did you say 20 messages ago?" | HIGH | Experimental feature in OpenClaw. Index JSONL session logs with debounced updates (~100 KB or 50 lines). Async, never blocks search. Defer to v2.1+. |
| **Memory citations** | Tool results include "Source: memory/2026-02-11.md#42" footer. Transparency + debugging. | LOW | Optional footer on memory_search results. OpenClaw `memory.citations = "auto"`. Easy to add once search works. |
| **Workspace git integration** | Auto-commit memory changes with timestamps. Recoverable history, audit trail. | LOW | Already have best-effort git commits for audit trail (v1.0 pattern). Extend to workspace. Private repo backup recommended (OpenClaw convention). |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems in personal AI assistants.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time memory sync across all sessions** | Users want instant propagation: update SOUL.md in session A, session B sees it immediately. | File watchers + index invalidation add complexity. Race conditions on concurrent writes. Memory writes are rare; polling/restart is fine. | Memory changes take effect on next session start. Agent can notify user "Updated SOUL.md, restart to apply." Simpler, no race conditions. |
| **Vector database as external service** | "Proper" architecture uses Pinecone/Qdrant/Chroma as separate service. | Single-user assistant doesn't need external DB. SQLite with sqlite-vec runs anywhere, zero ops. ChromaDB doesn't scale to 50M vectors but jarvis has <10K memory chunks. | SQLite with sqlite-vec extension for vector index. Embedding cache in SQLite. Matches OpenClaw. Production-grade for single user. |
| **Multi-model embedding ensemble** | "Better retrieval" by combining OpenAI + Voyage + local embeddings. | Embeddings must be same dimensionality to compare. Can't mix 1536-dim (OpenAI) with 384-dim (local) in one index. Reindex on model change is expensive. | Single embedding model per index. Provider auto-selection fallback chain: local → OpenAI → Gemini. Reindex on provider/model change (fingerprint in index). |
| **Infinite context window = no memory needed** | Claude Opus 4.5 has 400K tokens, Gemini 3 Pro has 2M. Just inject everything. | Cost: $3/M input tokens × 400K = $1.20 per message at scale. Latency: 400K tokens = seconds to process. Memory is index, not dump. | Selective retrieval: memory_search returns top-K relevant chunks. Typically 3-5 snippets (~2K tokens total) vs. full 400K context. 200x cost reduction. |
| **Automatic memory categorization** | AI auto-tags memories as "work", "personal", "preferences", etc. | Tags drift without clear criteria. Users expect control. Over-engineering for single-user assistant. | Simple two-tier structure: `MEMORY.md` (curated facts) + `memory/YYYY-MM-DD.md` (daily logs). Agent decides where to write based on durability. User can manually curate. |
| **Memory compaction/summarization** | Daily logs grow unbounded. Auto-summarize old entries to save space. | Risk: summarization loses details. "I mentioned a bug in version X" → summarized as "discussed bugs" → unsearchable. Disk is cheap. | Keep all daily logs. SQLite FTS5 + vector index handle thousands of files efficiently. Summarization as manual/future feature if needed. Index growth is the constraint, not file count. |

## Feature Dependencies

```
[HTTP Tool Invoke API]
    └──requires──> [Canonical Tool Registry]
                       └──requires──> [Tool Definition Schema]

[Semantic Memory Search]
    └──requires──> [Vector Embeddings]
                       └──requires──> [Embedding Provider (local or cloud)]
    └──requires──> [BM25 Full-Text Search]
                       └──requires──> [SQLite FTS5]

[Pre-Compaction Memory Flush]
    └──requires──> [Context Token Counting]
    └──requires──> [File-Based Memory Storage]

[Soul/Identity System]
    └──requires──> [Workspace Structure]
                       └──requires──> [File Loading on Session Start]

[Memory Search Tool]
    └──requires──> [Semantic Memory Search]
    └──requires──> [Memory File Chunking]

[Local Embeddings] ──enhances──> [Semantic Memory Search] (privacy, zero cost)

[Session Memory Indexing] ──requires──> [Semantic Memory Search] (uses same index)
                          ──conflicts──> [MVP timeline] (experimental, defer)

[Memory Citations] ──enhances──> [Memory Search Tool] (transparency, debugging)
```

### Dependency Notes

- **Memory Search Tool requires Semantic Memory Search:** Can't expose a tool without the underlying search capability. Search must work before tool is enabled.
- **Semantic Memory Search requires Vector Embeddings + BM25:** Hybrid approach needs both. BM25 is fallback if embeddings fail.
- **Pre-Compaction Memory Flush requires Context Token Counting:** Must know when to trigger flush (soft threshold at ~75% of context limit).
- **HTTP Tool Invoke API requires Canonical Tool Registry:** Single source of truth for tools. Registry must exist before HTTP endpoint can invoke tools.
- **Local Embeddings enhances Semantic Memory Search:** Optional privacy/cost improvement. Search works with cloud APIs if local unavailable.
- **Session Memory Indexing conflicts with MVP timeline:** Experimental feature. Adds debounced indexing, async complexity. Defer to v2.1+ after core memory works.

## MVP Definition

### Launch With (v2.0)

Minimum viable product for persistent memory + identity + shared tools.

- [x] **Workspace structure** — Foundation for all file-based features. `~/.jarvis/workspace/` with standard file locations.
- [x] **SOUL.md identity system** — Agent reads identity on session start. Personality continuity across sessions.
- [x] **File-based memory storage** — `MEMORY.md` + `memory/YYYY-MM-DD.md`. Agent can write, files persist across sessions.
- [x] **Memory file chunking** — Split Markdown into ~400 token chunks with 80-token overlap for indexing. Required for search.
- [x] **SQLite vector index (sqlite-vec)** — Embedding storage with cosine similarity. Foundation for semantic search.
- [x] **BM25 full-text search (FTS5)** — Keyword search for exact tokens. Complements vector search.
- [x] **Hybrid memory search** — Combine vector + BM25 with configurable weights (70/30 default). Union retrieval.
- [x] **memory_search tool** — Agent-facing tool to retrieve relevant memory chunks by semantic query.
- [x] **Embedding provider fallback chain** — Local → OpenAI → Gemini → Voyage. Graceful degradation if provider fails.
- [x] **Pre-compaction memory flush** — Silent turn at soft threshold (~75% context). Agent saves memories before compaction.
- [x] **HTTP tool invoke API** — `POST /tools/invoke` with bearer auth. Any surface calls same tools.
- [x] **Canonical tool registry** — Single registry with policy/allowlist support. Replaces separate MCP bridge + llm.tool() definitions.

### Add After Validation (v2.1+)

Features to add once core memory + identity + tools are working and validated.

- [ ] **memory_get tool** — Read specific memory files by path with line range. Complement to memory_search. Trigger: Users request "show me my full MEMORY.md" or need precise line ranges.
- [ ] **Memory citations** — "Source: memory/2026-02-11.md#42" footer on search results. Trigger: Users ask "where did you read that?" or debugging retrieval.
- [ ] **Workspace git auto-commit** — Extend v1.0 git pattern to workspace. Commit memory changes with timestamps. Trigger: Users want audit trail for memory edits.
- [ ] **Local embeddings (node-llama-cpp)** — Privacy-first option. Zero marginal cost. Trigger: Users concerned about API calls or embedding costs exceed $5/month.
- [ ] **Embedding cache optimization** — SQLite cache for chunk embeddings (avoid re-embedding unchanged text). Trigger: Reindexing takes >30 seconds on workspace changes.
- [ ] **USER.md file** — User identity, preferences, addressing conventions. Trigger: Users want to customize how agent addresses them or stores bio.

### Future Consideration (v2.2+)

Features to defer until product-market fit is established for memory system.

- [ ] **Session memory indexing** — Index JSONL session transcripts for in-session search. Trigger: Users frequently ask "what did you say 10 messages ago?" Experimental, async complexity.
- [ ] **QMD search backend** — Alternative search with Bun + reranking. Trigger: Hybrid search quality insufficient or users request better ranking. OpenClaw experimental feature.
- [ ] **Memory compaction/summarization** — Auto-summarize old daily logs to reduce index size. Trigger: Index size exceeds 100K chunks or search slows to >1 second.
- [ ] **HEARTBEAT.md / BOOT.md** — Startup checklists for gateway restarts and routine runs. Trigger: Users want scheduled maintenance tasks or startup rituals.
- [ ] **TOOLS.md conventions** — Local tool notes (calendar IDs, contact info). Trigger: Users manage many local references that don't fit SOUL.md or MEMORY.md.
- [ ] **Multi-workspace support** — Switch between work/personal workspaces. Trigger: Users need strict separation (not just mode context). Currently modes cover use case.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Workspace structure | HIGH | LOW | P1 |
| SOUL.md identity | HIGH | LOW | P1 |
| File-based memory | HIGH | LOW | P1 |
| Memory chunking | HIGH | MEDIUM | P1 |
| SQLite vector index | HIGH | MEDIUM | P1 |
| BM25 full-text search | HIGH | MEDIUM | P1 |
| Hybrid search | HIGH | MEDIUM | P1 |
| memory_search tool | HIGH | LOW | P1 |
| Provider fallback chain | MEDIUM | LOW | P1 |
| Pre-compaction flush | HIGH | MEDIUM | P1 |
| HTTP tool invoke API | HIGH | LOW | P1 |
| Canonical tool registry | HIGH | MEDIUM | P1 |
| memory_get tool | MEDIUM | LOW | P2 |
| Memory citations | MEDIUM | LOW | P2 |
| Workspace git commits | MEDIUM | LOW | P2 |
| Local embeddings | MEDIUM | MEDIUM | P2 |
| Embedding cache | MEDIUM | MEDIUM | P2 |
| USER.md file | LOW | LOW | P2 |
| Session memory indexing | LOW | HIGH | P3 |
| QMD search backend | LOW | HIGH | P3 |
| Memory compaction | LOW | MEDIUM | P3 |
| HEARTBEAT.md / BOOT.md | LOW | LOW | P3 |
| TOOLS.md conventions | LOW | LOW | P3 |
| Multi-workspace support | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch (v2.0)
- P2: Should have, add when possible (v2.1)
- P3: Nice to have, future consideration (v2.2+)

## Competitor Feature Analysis

| Feature | OpenClaw | Mem0.ai | Jarvis Approach |
|---------|----------|---------|-----------------|
| **Memory storage** | Markdown files (`MEMORY.md` + daily logs) | Database (PostgreSQL, Qdrant, etc.) | Markdown files (matches OpenClaw, agent-readable) |
| **Search method** | Hybrid vector (sqlite-vec) + BM25 (FTS5) | Vector only (multiple backend options) | Hybrid vector + BM25 (best of both: semantic + exact) |
| **Identity system** | SOUL.md + USER.md + IDENTITY.md | Personality as graph nodes | SOUL.md (simpler, file-based, version-controllable) |
| **Embedding providers** | Local (node-llama-cpp) → OpenAI → Gemini → Voyage | OpenAI, Azure, Anthropic, Google, Hugging Face, Ollama, Together, Groq | Local → OpenAI → Gemini → Voyage (privacy-first fallback chain) |
| **Vector storage** | SQLite with sqlite-vec extension | Qdrant, Chroma, Milvus, Pgvector, Redis, Azure AI Search | SQLite with sqlite-vec (zero ops, runs anywhere) |
| **Multi-surface tools** | HTTP API (`/tools/invoke`) + built-in registry | Not applicable (memory service, not assistant) | HTTP API + canonical tool registry (unifies surfaces) |
| **Pre-compaction flush** | Silent turn at soft threshold, writes to disk | Not applicable (no session management) | Silent turn at 75% context, writes to memory files |
| **Workspace conventions** | `~/.openclaw/workspace/` with standard file layout | Not applicable | `~/.jarvis/workspace/` (follows OpenClaw conventions) |
| **Graceful degradation** | BM25 fallback if embeddings fail | Requires vector backend configured | BM25 fallback + provider chain (continues working if one provider down) |
| **Session memory** | Experimental: index session transcripts | Not applicable | Defer to v2.1+ (experimental, high complexity) |

**Key differentiators vs. OpenClaw:**
- Jarvis is single-user assistant (no multi-agent, no Moltbook social network)
- Simpler file structure (no HEARTBEAT.md, BOOT.md, TOOLS.md in MVP)
- Focus on multi-surface tool unification (HTTP API critical for Telegram + iOS + CLI)

**Key differentiators vs. Mem0.ai:**
- Mem0 is a memory service/library; Jarvis is a full assistant
- Jarvis uses file-based memory (agent-readable, version-controllable, transparent)
- Mem0 supports multi-tenant; Jarvis is single-user (simpler architecture)

## Implementation Complexity Assessment

### Low Complexity (1-2 days)

- **Workspace structure:** Create `~/.jarvis/workspace/` directory, define standard file paths
- **SOUL.md identity:** Load file at session start, inject into system prompt
- **File-based memory:** Write functions to append to `MEMORY.md` and `memory/YYYY-MM-DD.md`
- **memory_get tool:** Read file by path, return lines (validation + policy checks)
- **Memory citations:** Append "Source: <path>#<line>" to memory_search results
- **HTTP tool invoke API:** Add POST endpoint to existing Gateway HTTP handler
- **Provider fallback chain:** Try providers in sequence until one succeeds

### Medium Complexity (3-5 days)

- **Memory chunking:** Split Markdown into ~400 token chunks with 80-token overlap (sliding window)
- **SQLite vector index:** Integrate sqlite-vec, create virtual table, insert/query embeddings
- **BM25 full-text search:** Create FTS5 table, index chunks, query with rank conversion
- **Hybrid search:** Combine vector + BM25 results, union by chunk ID, weighted scoring
- **memory_search tool:** Implement search logic, return snippets with metadata, cap at 700 chars
- **Pre-compaction flush:** Token counting, soft threshold detection, silent turn injection
- **Canonical tool registry:** Unify tool definitions, add policy/allowlist support
- **Embedding cache:** SQLite cache table, fingerprint-based invalidation
- **Local embeddings:** Integrate node-llama-cpp, auto-download GGUF model, fallback chain

### High Complexity (1-2 weeks)

- **Session memory indexing:** Debounced JSONL indexing, async updates, delta thresholds, never block search
- **QMD search backend:** External Bun process, HuggingFace GGUF downloads, reranking, fallback handling
- **Memory compaction/summarization:** Summarization prompts, validation, risk of detail loss, manual curation flow

## Current State Analysis (What Already Exists)

**From v1.0:**
- JSONL session logs (append-only, max 50 messages) → extend to daily memory logs
- JSON preference files → pattern extends to SOUL.md, MEMORY.md
- Confirmation flow for config changes → reuse for memory writes
- Best-effort git commits for audit trail → extend to workspace
- Claude Code SDK agent with streaming → memory tools integrate naturally
- Gateway HTTP+WS multiplex → add `/tools/invoke` endpoint
- Extension API for integrations → canonical tool registry builds on this
- TypeBox validation → validate tool schemas, memory file writes

**Gaps to fill:**
- No vector embeddings (add sqlite-vec + embedding providers)
- No semantic search (add hybrid vector + BM25)
- No workspace structure (create `~/.jarvis/workspace/`)
- No identity system (add SOUL.md loading)
- No pre-compaction flush (add token counting + silent turn)
- Tools defined separately per surface (unify into canonical registry)

**Leverage existing patterns:**
- Atomic writes with TypeBox validation → memory file writes
- Extension lifecycle → tool registry lifecycle
- Confirmation flow → memory write confirmation (optional)
- Git audit trail → workspace commits

## Sources

**OpenClaw Documentation & Implementation:**
- [OpenClaw Memory System](https://docs.openclaw.ai/concepts/memory) — File structure, pre-compaction flush, vector+BM25 hybrid search, configuration
- [OpenClaw SOUL.md Template](https://github.com/openclaw/openclaw/blob/main/docs/reference/templates/SOUL.md) — Identity file structure, core truths, boundaries, continuity
- [OpenClaw Session Management & Compaction](https://docs.openclaw.ai/reference/session-management-compaction) — Token thresholds, reserve tokens, compaction triggers, memory flush
- [OpenClaw Tools Invoke HTTP API](https://docs.openclaw.ai/gateway/tools-invoke-http-api) — Endpoint structure, authentication, request/response format, policy
- [OpenClaw Agent Workspace](https://docs.openclaw.ai/concepts/agent-workspace) — Directory layout, file conventions, separation of config vs. workspace
- [OpenClaw and the Programmable Soul](https://duncsand.medium.com/openclaw-and-the-programmable-soul-2546c9c1782c) — SOUL.md philosophy, persistent identity, social context
- [Agentic AI: OpenClaw Memory Architecture Explained](https://medium.com/@shivam.agarwal.in/agentic-ai-openclaw-moltbot-clawdbots-memory-architecture-explained-61c3b9697488) — Hybrid search, vector+BM25 weights, graceful degradation
- [Clawdbot Memory Architecture & Pre-Compaction Flush](https://medium.com/aimonks/clawdbots-memory-architecture-pre-compaction-flush-the-engineering-reality-behind-never-c8ff84a4a11a) — Detection, flush action, safe compaction workflow

**AI Assistant Memory Best Practices:**
- [Comparing File Systems and Databases for AI Agent Memory](https://medium.com/oracledevs/comparing-file-systems-and-databases-for-effective-ai-agent-memory-management-5322ac45f3b6) — File-based vs. database tradeoffs, virtual filesystem pattern, dual-layer architecture
- [AI Agent Long-Term Memory: Episodic, Semantic & Procedural](https://fast.io/resources/ai-agent-long-term-memory-solutions/) — Memory types, organization, hot path vs. cold path
- [Memory Optimization Strategies in AI Agents](https://medium.com/@nirdiamant21/memory-optimization-strategies-in-ai-agents-1f75f8180d54) — Chunking, retrieval, context management
- [Common AI Agent Development Mistakes and How to Avoid Them](https://www.wildnetedge.com/blogs/common-ai-agent-development-mistakes-and-how-to-avoid-them) — Memory management pitfalls, token costs, reasoning quality

**Vector Embeddings & Search:**
- [13 Best Embedding Models in 2026](https://elephas.app/blog/best-embedding-models) — OpenAI, Voyage, Gemini, Ollama pricing and performance
- [Mem0 Graph Memory for AI Agents](https://mem0.ai/blog/graph-memory-solutions-ai-agents) — Hybrid vector+graph retrieval, provider integration, dual deployment model
- [SQLite-vec GitHub](https://github.com/asg017/sqlite-vec) — Pure C extension, runs anywhere, horizontal scalability
- [SQLite vs. ChromaDB Comparative Analysis](https://stephencollins.tech/posts/sqlite-vs-chroma-comparative-analysis) — File-based architecture, concurrency limitations, production scale
- [Best Vector Databases in 2025](https://www.firecrawl.dev/blog/best-vector-databases-2025) — Qdrant, Pinecone, ChromaDB, FAISS comparisons

**Chunking Strategies:**
- [Finding the Best Chunking Strategy for Accurate AI Responses](https://developer.nvidia.com/blog/finding-the-best-chunking-strategy-for-accurate-ai-responses/) — Token sizes, overlap percentages, adaptive strategies
- [Chunking Strategies to Improve LLM RAG Pipeline Performance](https://weaviate.io/blog/chunking-strategies-for-rag) — 512 tokens with 50-100 overlap, factoid vs. analytical queries
- [Evaluating Chunking Strategies for Retrieval](https://research.trychroma.com/evaluating-chunking) — 15% overlap performs best, 256-1024 token range

**Tool Registry & Multi-Surface:**
- [ToolSDK.ai MCP Registry](https://github.com/toolsdk-ai/toolsdk-mcp-registry) — Interoperability standards, A2A + MCP collaboration, agent discovery
- [Tool Registry - Go beyond simple tool calling](https://www.toolregistry.ai/) — SaaS apps, REST APIs, remote MCP servers, managed integrations

**Workspace Conventions:**
- [AI Agent Rule / Instruction / Context Files](https://gist.github.com/0xdevalias/f40bc5a6f84c4c5ad862e314894b2fa6) — AGENTS.md, hierarchical layouts, progressive disclosure
- [A Complete Guide To AGENTS.md](https://www.aihero.dev/a-complete-guide-to-agents-md) — Root-level guidance, package-specific overrides, least privilege principle

---
*Feature research for: Personal AI Assistant with Persistent Memory & Identity*
*Researched: 2026-02-12*
