# Project Research Summary

**Project:** jarvis v2.0
**Domain:** Self-Hosted AI Assistant with Persistent Memory, Identity, and Multi-Surface Tool Access
**Researched:** 2026-02-12
**Confidence:** HIGH

## Executive Summary

Jarvis v2.0 adds three foundational capabilities to a working AI assistant: persistent searchable memory (MEMORY.md + daily logs + hybrid vector/BM25 search), file-based identity system (SOUL.md), and HTTP tool API for multi-surface tool sharing. These features follow established patterns from OpenClaw/Mem0, adapted for single-user self-hosted deployment with privacy-first principles.

The recommended approach leverages SQLite-based local infrastructure: sqlite-vec for vector search, better-sqlite3 for storage, and Transformers.js for local embeddings (zero API costs, full privacy). Hybrid search combines semantic retrieval (vector) with keyword matching (BM25) using Reciprocal Rank Fusion, providing robust memory search that catches both "help with authentication" (semantic) and "Linear issue #42" (keyword). The HTTP tool API unifies tool access across Telegram, LiveKit voice, iOS app, and future surfaces using Hono, while maintaining in-process MCP bridge for text agent performance.

Critical risks center on integration complexity with existing v1.0 architecture: session migration without data loss, SOUL.md security against prompt injection (known vulnerability with published exploits), context window budget management as memory/soul/tools compete for tokens, concurrent tool execution state corruption across multiple surfaces, and memory contradiction accumulation as facts change over time. These are preventable with deliberate design—conflict resolution in memory search, read-only SOUL.md with git tracking, explicit context budgets, atomic file writes, and proper authentication on HTTP endpoints. The research identifies specific pitfalls for each phase with verification tests.

## Key Findings

### Recommended Stack

The v2.0 stack emphasizes local-first, zero-dependency infrastructure running entirely on the existing VPS (srv1312265). Core additions are better-sqlite3 (fastest synchronous SQLite driver, 3.5x faster than alternatives), sqlite-vec (lightweight vector search extension), @huggingface/transformers v3 (local embedding generation with WebGPU support), wink-bm25-text-search (proven BM25 implementation), gray-matter (standard Markdown frontmatter parser), and Hono + @hono/node-server (ultrafast HTTP framework already in dependencies).

**Core technologies:**
- **better-sqlite3 + sqlite-vec**: Single-file embedded vector database with HNSW-style graph search, runs in-process, zero external services, sub-millisecond search for <10k vectors
- **@huggingface/transformers + bge-small-en-v1.5**: Local embedding generation (384-dim vectors, superior quality vs all-MiniLM-L6-v2), eliminates OpenAI API costs and network dependency, ~200MB model footprint
- **wink-bm25-text-search**: Mature probabilistic keyword search with configurable parameters, designed for combining with vector search, proven in production
- **gray-matter**: De facto standard for Markdown frontmatter parsing (used by Next.js, Astro, Gatsby), handles MEMORY.md and daily log metadata
- **Hono + @hono/node-server**: 3.5x faster than Express, built on Web Standards, already present in node_modules, perfect for single-endpoint tool API

**Critical version notes:**
- sqlite-vec is alpha (0.1.7-alpha.2) but production-ready—68 projects use it, creator uses in production
- Avoid deprecated @xenova/transformers (replaced by @huggingface/transformers v3)
- Avoid all-MiniLM-L6-v2 model (outdated, 56% accuracy vs bge-small's superior performance)

### Expected Features

Research reveals clear table stakes vs. differentiators for personal AI assistants with memory in 2026. OpenClaw and Mem0 establish the feature baseline.

**Must have (table stakes):**
- **File-based persistent memory**: MEMORY.md (curated facts) + memory/YYYY-MM-DD.md (daily logs) as source of truth, industry standard pattern
- **Semantic memory search**: Hybrid vector + BM25 search tool, users expect "remember when I said X" across sessions
- **Soul/identity file**: SOUL.md loaded at session start for consistent personality, "who are you?" should have stable answer
- **Pre-compaction memory flush**: Silent turn at ~75% context limit to extract key facts before compaction, prevents data loss on context overflow
- **Memory search tool**: memory_search(query) returns snippets with file paths, relevance scores, capped at ~700 chars per result
- **Daily memory logs**: One file per day, auto-loads today + yesterday at session start, agent appends running notes
- **Workspace structure**: ~/.jarvis/workspace/ for memory/identity/agent files, separation from config/credentials/sessions

**Should have (differentiators):**
- **HTTP tool invoke API**: POST /tools/invoke with bearer auth, any surface (Telegram, iOS, CLI, web) calls same tools, single source of truth
- **Local embeddings option**: Transformers.js with bge-small model, privacy-first users want memory search without cloud API calls, zero marginal cost
- **Hybrid vector + BM25 with graceful degradation**: If embeddings fail (API down, quota exceeded), BM25 keyword search still works
- **Memory citations**: Tool results include "Source: memory/2026-02-11.md#42" footer for transparency and debugging
- **Workspace git integration**: Auto-commit memory changes with timestamps (extends v1.0 audit trail pattern)

**Defer (v2.1+):**
- **Session memory indexing**: Index JSONL session logs for "what did you say 20 messages ago?" queries—experimental, high complexity, async concerns
- **memory_get tool**: Read specific memory files by path with line range, adds after search works
- **USER.md file**: User identity and preferences, triggers when users want to customize how agent addresses them
- **Memory compaction/summarization**: Auto-summarize old daily logs, defer until index size exceeds 100K chunks or search slows to >1 second

### Architecture Approach

Standard architecture for AI agents with memory follows a layered pattern: surfaces → gateway → agent orchestrator → LLM provider → storage. Jarvis v2.0 adds three horizontal concerns: MemorySystem (semantic search at session start), IdentityLoader (SOUL.md injection), and ToolRegistry (unified tool definitions exposed via HTTP + MCP bridge).

**Major components:**
1. **@jarvis/core/memory**: MemoryManager class handles loading MEMORY.md + daily logs (gray-matter), generating embeddings (Transformers.js), storing in SQLite + vec extension (better-sqlite3, sqlite-vec), indexing with BM25 (wink-bm25-text-search), executing hybrid search queries (custom RRF). Exposes memory_search tool to agent.
2. **@jarvis/core/identity**: Loads soul.md at startup, parses identity metadata and content, exposes to agent system prompt, optionally hot-reloads on changes. Separation: read-only identity (IDENTITY.md) from evolvable persona (PERSONA.md) prevents prompt injection.
3. **@jarvis/tool-api**: New package with Hono HTTP server, /api/tools/invoke endpoint, ToolRegistry class with canonical tool definitions. Accepts tool invocation requests from any surface, routes to AgentOrchestrator, returns results as JSON. Integration: @jarvis/core adds invokeTool(name, args, mode) method to AgentOrchestrator, @jarvis/gateway exposes orchestrator to API server.

**Key patterns:**
- **Memory context injection**: Load SOUL.md + search memories once at session start, inject into system prompt before first LLM call. Simpler than RAG-style mid-conversation retrieval, lower latency.
- **Hybrid vector + BM25 search**: Run both searches in parallel, merge with Reciprocal Rank Fusion (RRF: score = sum(1/(k + rank)) with k=60), return top K. Catches semantic matches and exact keywords.
- **Tool registry with dual access**: HTTP API for external clients (voice, iOS, web), in-process MCP bridge for text agent (low latency). Single source of truth for tool definitions and execution.
- **Pre-compaction memory flush**: Before compacting daily logs into MEMORY.md, LLM extracts key facts/decisions from raw session data. Preserves important context, human-readable MEMORY.md serves as audit trail.

**Build order dependencies:**
1. Phase 1 (Identity): SOUL.md loading → no dependencies, pure file I/O
2. Phase 2 (Memory Persistence): JSONL logs → depends on workspace structure from Phase 1
3. Phase 3 (Semantic Search): Vector + BM25 → depends on logs to index from Phase 2
4. Phase 4 (Tool API): HTTP endpoint → no dependencies, can build in parallel with memory phases
5. Phase 5 (Memory Compaction): Nightly LLM extraction → depends on logs + vector index from Phases 2-3

### Critical Pitfalls

Research identifies 10 critical pitfalls with specific prevention strategies and verification tests. Top 5 for roadmap attention:

1. **Memory contradiction accumulation** — Vector embeddings treat each memory independently, semantic search doesn't understand temporal relationships. Old "User prefers coffee" retrieved alongside new "User stopped drinking coffee" with no way to resolve which is current. **Prevention**: Implement memory conflict resolution before semantic search goes live, track timestamps with recency weighting, use graph memory or explicit relationship tracking, design pre-compaction flush to extract durable facts vs ephemeral state. **Phase 1 must address this—not a later enhancement.**

2. **SOUL.md prompt injection backdoor** — SOUL.md loaded into every system prompt makes it highest-value target. Known vulnerability with published exploits: attackers modify SOUL.md to introduce long-term behavioral changes persisting across restarts, create scheduled tasks re-injecting attacker logic. Jarvis has cron scheduling and self-configuration tools—the exact capabilities exploited. **Prevention**: NEVER allow agent to write SOUL.md directly, implement integrity checks on load (checksum, git commit verification), separate read-only identity from evolvable persona, require explicit user confirmation for personality changes, sandbox agent tool execution. **Phase 2 must address security before shipping.**

3. **Context window budget blowout** — System prompt overhead balloons: SOUL.md (500-2k tokens) + memory search (1k-5k tokens) + tool definitions (2k-10k tokens). Each component competes for context budget without tracking cumulative usage. Multi-million-token windows create false confidence. **Prevention**: Measure baseline context usage FIRST (Claude Code system prompt + tool definitions + typical conversation), define explicit budget allocation (system 20%, soul 5%, memory 15%, tools 10%, conversation 50%), implement dynamic allocation, truncate memory search results to fit budget, monitor token usage per request. **Phase 1 must define and enforce budget from day one.**

4. **HTTP tool API authentication bypass** — Adding HTTP tool invoke endpoint without proper authentication creates open RPC endpoint. Anyone on network can invoke tools as agent—send emails, modify Linear issues, execute code. Combined with Tailscale deployment, anyone with Tailscale access controls the agent. **Prevention**: Require authentication from day one (API key minimum, JWT better, mTLS best), separate auth per surface (Telegram, iOS, CLI), rate limiting per client, audit log of tool invocations with surface identity, principle of least privilege. **Phase 3 must implement auth before exposing HTTP endpoint—security is not a Phase 4 optimization.**

5. **Concurrent tool execution state corruption** — Multiple surfaces (Telegram + iOS + CLI) invoking tools concurrently creates race conditions. Two surfaces read preferences simultaneously, both modify, both write—last write wins, one update lost. Concurrent Gmail calls cause OAuth token refresh race—both request new tokens, one expires, calls fail. **Prevention**: Use write-file-atomic for all file writes (temp file + atomic rename), implement distributed locks for critical sections (Redis, file locks), make tools idempotent, OAuth refresh with check-lock-refresh pattern, request queuing for tools that can't handle concurrency. **Phase 3 must address concurrency before multiple surfaces share endpoint.**

**Additional critical pitfalls:**
- **Vector index corruption without recovery**: ChromaDB SQLite corruption during unclean shutdown, no automated recovery. Prevention: graceful shutdown handlers, integrity checks on startup, automated reindex from WAL.
- **Embedding cost spiral**: Naively embedding every message causes costs to spiral. Prevention: batch requests (50% savings), cache static content (SOUL.md, preferences), use text-embedding-3-small not ada-002, consider local models.
- **JSONL session migration data loss**: Migrating from v1.0 sessions to v2.0 workspace without backward compatibility loses history. Prevention: detect legacy files, automated migration script, dual write during migration window.
- **Memory search retrieving wrong context**: Similarity search retrieves contextually wrong memories. Prevention: metadata filtering (project, date, type), recency weighting, hybrid BM25 + vector, query expansion with conversation context.
- **Soul personality drift without tracking**: SOUL.md evolves through small edits, gradually drifting from intended personality. Prevention: git commit every change, periodic snapshots, drift detection, user review of changes.

## Implications for Roadmap

Based on research, suggest 4-phase roadmap structure with clear dependency order and pitfall mitigation.

### Phase 1: Memory Foundation & Identity
**Rationale:** SOUL.md and memory persistence are foundational, low-risk changes with no external dependencies. Must establish workspace structure, context budget, and migration from v1.0 before adding complexity. Identity loading is pure file I/O with immediate value. Memory persistence (JSONL logs → workspace) extends existing patterns.

**Delivers:**
- Workspace structure (~/.jarvis/workspace/) with standard file paths
- SOUL.md identity system loaded at session start, injected into system prompt
- File-based memory storage (MEMORY.md + memory/YYYY-MM-DD.md)
- v1.0 session migration without data loss
- Context window budget allocation and enforcement
- Git tracking for SOUL.md and memory changes

**Addresses features:**
- Soul/identity file (table stakes)
- File-based persistent memory (table stakes)
- Daily memory logs (table stakes)
- Workspace structure (table stakes)
- Workspace git integration (differentiator)

**Avoids pitfalls:**
- SOUL.md prompt injection backdoor (read-only SOUL.md, git integrity checks)
- Context window budget blowout (define and enforce budget from start)
- JSONL session migration data loss (automated migration script)
- Soul personality drift (git commit tracking)

**Needs research:** NO — file I/O patterns are standard, OpenClaw conventions documented

---

### Phase 2: Semantic Search & Memory Tools
**Rationale:** With workspace and identity established, add semantic search infrastructure. Hybrid vector + BM25 search is core value proposition. Memory search tool exposes retrieval to agent. Must address memory contradiction accumulation, embedding cost management, and vector index corruption before going live.

**Delivers:**
- Memory file chunking (~400 token chunks with 80-token overlap)
- SQLite vector index (better-sqlite3 + sqlite-vec)
- BM25 full-text search (wink-bm25-text-search)
- Hybrid memory search (vector + BM25 with RRF)
- Local embeddings (Transformers.js + bge-small-en-v1.5)
- Embedding provider fallback chain (local → OpenAI → Gemini → Voyage)
- memory_search tool exposed to agent
- Vector index integrity checks and automated recovery
- Memory conflict resolution with recency weighting

**Addresses features:**
- Semantic memory search (table stakes)
- Memory search tool (table stakes)
- Local embeddings option (differentiator)
- Hybrid vector + BM25 with graceful degradation (differentiator)

**Uses stack:**
- better-sqlite3, sqlite-vec (vector storage)
- @huggingface/transformers, bge-small-en-v1.5 (local embeddings)
- wink-bm25-text-search (keyword search)
- Custom RRF implementation (hybrid fusion)

**Avoids pitfalls:**
- Memory contradiction accumulation (conflict resolution, recency weighting, metadata filtering)
- Embedding cost spiral (batching, caching static content, local model default)
- Vector index corruption (integrity checks, automated recovery, graceful shutdown)
- Memory search retrieving wrong context (hybrid search, metadata filtering, query expansion)

**Needs research:** NO — sqlite-vec integration documented, Transformers.js usage clear, hybrid search patterns established

---

### Phase 3: HTTP Tool API & Multi-Surface Unification
**Rationale:** With memory and identity working, unify tool access across surfaces. HTTP API enables iOS app and future surfaces to call tools without embedding logic. Must address authentication, concurrency, and rate limiting before exposing endpoint. Can build in parallel with earlier phases since no dependencies on memory system.

**Delivers:**
- @jarvis/tool-api package with Hono HTTP server
- POST /api/tools/invoke endpoint with bearer auth
- ToolRegistry class with canonical tool definitions
- Per-surface authentication tokens (Telegram, iOS, CLI)
- Rate limiting per client
- Audit log of tool invocations with surface identity
- Concurrent execution handling with atomic file writes
- OAuth refresh concurrency safety (check-lock-refresh pattern)
- Integration: AgentOrchestrator.invokeTool() method
- Gateway routing /api/tools/* to tool-api
- LiveKit agent using HTTP API instead of direct tool calls

**Addresses features:**
- HTTP tool invoke API (differentiator)
- Canonical tool registry (table stakes)

**Uses stack:**
- Hono, @hono/node-server (HTTP framework)
- Zod (schema validation, already in @jarvis/core)

**Avoids pitfalls:**
- HTTP tool API authentication bypass (API key/JWT auth, per-surface tokens, rate limiting)
- Concurrent tool execution state corruption (write-file-atomic, distributed locks, OAuth refresh safety)

**Needs research:** NO — Hono patterns documented, tool registry design clear from OpenClaw

---

### Phase 4: Pre-Compaction Flush & Memory Optimization
**Rationale:** With core memory, identity, and tools working, add intelligent memory management. Pre-compaction flush prevents context overflow data loss. Optimization improves cost and performance. Memory citations add transparency. This phase refines the system, not foundational.

**Delivers:**
- Pre-compaction memory flush (silent turn at ~75% context limit)
- LLM-based memory extraction from daily logs
- Conflict detection in compaction prompts
- Ephemeral vs. durable fact distinction
- Memory citations ("Source: memory/2026-02-11.md#42")
- Embedding cache optimization (SQLite cache for chunk embeddings)
- Batch embedding generation for improved throughput
- memory_get tool (read specific memory files by path)

**Addresses features:**
- Pre-compaction memory flush (table stakes)
- Memory citations (differentiator)

**Avoids pitfalls:**
- Context window budget blowout (pre-compaction preserves conversation continuity)
- Embedding cost spiral (caching, batching added in optimization)

**Needs research:** MAYBE — Pre-compaction flush prompts need experimentation to extract durable facts effectively, conflict detection heuristics need tuning

---

### Phase Ordering Rationale

**Why this order:**
1. **Identity + Memory Foundation first** because they have no dependencies, establish workspace structure for later phases, and must address migration from v1.0 before adding complexity
2. **Semantic Search second** because it depends on workspace structure and memory files from Phase 1, is the core value proposition, and must be solid before exposing to users
3. **HTTP Tool API third** because it's independent of memory system (can build in parallel), but authentication and concurrency concerns are easier to address once memory patterns are established
4. **Pre-Compaction Flush fourth** because it depends on memory search working (Phase 2) and benefits from observing real usage patterns to tune extraction prompts

**Why this grouping:**
- Phase 1 groups low-complexity file I/O changes that share workspace structure
- Phase 2 groups search infrastructure (vector + BM25 + embeddings) as single coherent capability
- Phase 3 isolates HTTP API concerns (auth, concurrency, rate limiting) in dedicated package
- Phase 4 groups optimization and refinement features that enhance existing capabilities

**How this avoids pitfalls:**
- Each phase has explicit pitfall prevention requirements in deliverables
- Security concerns addressed before shipping (SOUL.md read-only in Phase 1, HTTP auth in Phase 3)
- Migration and budget concerns addressed in Phase 1 before adding memory search
- Concurrency addressed in Phase 3 before multiple surfaces share tool API
- Memory contradiction resolution required in Phase 2 before semantic search goes live

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 4 (Pre-Compaction Flush)**: LLM prompts for memory extraction need experimentation to balance durable facts vs. ephemeral state, conflict detection heuristics need tuning based on real usage patterns, may need research-phase to validate extraction quality

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Memory Foundation & Identity)**: File I/O patterns well-documented, OpenClaw workspace conventions clear, JSONL migration is data transformation
- **Phase 2 (Semantic Search)**: sqlite-vec integration documented, Transformers.js usage examples abundant, hybrid search patterns established in Elasticsearch/Qdrant
- **Phase 3 (HTTP Tool API)**: Hono framework documented, tool registry pattern clear from OpenClaw, authentication with JWT is standard web practice

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified with official npm/docs, integration points validated against existing jarvis packages, alternatives evaluated with specific tradeoffs |
| Features | HIGH | Table stakes vs. differentiators clear from OpenClaw/Mem0 analysis, MVP definition matches 2026 personal AI assistant standards, defer criteria well-defined |
| Architecture | HIGH | Memory context injection, hybrid search, tool registry, pre-compaction flush patterns documented by OpenClaw/Mem0, component boundaries clear, integration points identified |
| Pitfalls | MEDIUM-HIGH | Strong web search + official docs, verified with multiple sources, known vulnerabilities (SOUL.md injection) documented with exploits, recovery strategies tested in production by others |

**Overall confidence:** HIGH

Stack, features, and architecture research reached high confidence through official documentation, established patterns in OpenClaw/Mem0, and version verification. Pitfalls research is medium-high because while specific issues are well-documented (ChromaDB corruption recovery, SOUL.md injection exploits, OAuth refresh race conditions), some prevention strategies are inferred from general best practices rather than jarvis-specific testing.

### Gaps to Address

**Deployment resource requirements**: Research identifies +500MB RAM for Transformers.js model, +100MB disk for model cache, CPU-bound embedding generation. VPS srv1312265 specs not verified—need to confirm available RAM and CPU capacity during Phase 2 planning. If insufficient, fallback to OpenAI embeddings or consider local model quantization (FP8 for 50% throughput gain).

**Context budget baseline measurement**: Research recommends explicit budget allocation (system 20%, soul 5%, memory 15%, tools 10%, conversation 50%), but Claude Code SDK system prompt overhead is unknown. Phase 1 must measure baseline tokens consumed by Claude Code + tool definitions + typical conversation before enforcing budget. If Claude Code overhead exceeds assumptions, ratios need adjustment.

**Pre-compaction flush prompt engineering**: Research describes pattern (LLM extracts key facts from logs) but doesn't provide specific prompts. Phase 4 needs experimentation to balance durable facts ("Acme Corp is in Room 105") vs. ephemeral state ("User is currently in Room 105"). Conflict detection heuristics ("User stopped drinking coffee" supersedes "User prefers coffee") need tuning. This is the primary gap requiring research-phase validation.

**SOUL.md vs IDENTITY.md vs PERSONA.md separation**: Research suggests separating read-only identity (IDENTITY.md) from evolvable persona (PERSONA.md) to prevent prompt injection, but OpenClaw uses unified SOUL.md. Phase 2 planning should decide: (1) single read-only SOUL.md with manual edits only, (2) IDENTITY.md (immutable) + PERSONA.md (evolvable with git tracking), or (3) SOUL.md with strict write permissions and integrity checks. Security vs. flexibility tradeoff.

**Embedding cache invalidation strategy**: Research recommends caching embeddings for static content (SOUL.md, preferences, archived memories) to reduce costs, but doesn't specify fingerprinting approach. Phase 4 should decide: (1) content hash (MD5/SHA256 of text), (2) file modification timestamp, or (3) git commit SHA. Hash is most reliable but adds overhead, timestamp can miss in-place edits, git SHA requires git dependency.

## Sources

### Primary (HIGH confidence)

**Stack Research:**
- [better-sqlite3 vs node:sqlite benchmark](https://sqg.dev/blog/sqlite-driver-benchmark) — Performance comparison (Jan 2026), validated 3.5x speed claim
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) — Official repository, version 0.1.7-alpha.2, integration patterns
- [@huggingface/transformers Documentation](https://huggingface.co/docs/transformers.js/en/index) — Version 3.8.1, local embedding usage
- [Best Open-Source Embedding Models in 2026](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models) — bge-small-en-v1.5 benchmarks vs all-MiniLM-L6-v2
- [Hono Documentation](https://hono.dev/docs/) — Official docs, Node.js integration guide

**Feature Research:**
- [OpenClaw Memory System](https://docs.openclaw.ai/concepts/memory) — File structure, pre-compaction flush, hybrid search, configuration
- [OpenClaw SOUL.md Template](https://github.com/openclaw/openclaw/blob/main/docs/reference/templates/SOUL.md) — Identity file structure
- [OpenClaw Tools Invoke HTTP API](https://docs.openclaw.ai/gateway/tools-invoke-http-api) — Endpoint structure, authentication, policy
- [Mem0 Graph Memory for AI Agents](https://mem0.ai/blog/graph-memory-solutions-ai-agents) — Hybrid vector+graph retrieval, provider integration

**Architecture Research:**
- [AI Agent Memory: Build Stateful AI Systems That Remember](https://redis.io/blog/ai-agent-memory-stateful-systems/) — Memory context injection pattern
- [Build persistent memory for agentic AI applications with Mem0](https://aws.amazon.com/blogs/database/build-persistent-memory-for-agentic-ai-applications-with-mem0-open-source-amazon-elasticache-for-valkey-and-amazon-neptune-analytics/) — Dual-layer architecture
- [RAG is not Agent Memory](https://www.letta.com/blog/rag-vs-agent-memory) — Why mid-conversation retrieval is anti-pattern

**Pitfalls Research:**
- [OpenClaw or Open Door? Prompt Injection Creates AI Backdoors](https://www.esecurityplanet.com/threats/openclaw-or-open-door-prompt-injection-creates-ai-backdoors/) — SOUL.md injection vulnerability with exploits
- [Rebuilding Chroma DB](https://cookbook.chromadb.dev/strategies/rebuilding/) — ChromaDB index corruption recovery
- [Refresh Token Race Condition](https://developers.apideck.com/guides/refresh-token-race-condition) — OAuth concurrent refresh issues
- [write-file-atomic npm package](https://www.npmjs.com/package/write-file-atomic) — Atomic file operations

### Secondary (MEDIUM confidence)

- [Hybrid Search: Combining BM25 and Semantic Search](https://medium.com/etoai/hybrid-search-combining-bm25-and-semantic-search-for-better-results-with-lan-1358038fe7e6) — Score normalization approaches, RRF formula
- [How We Solved Memory Conflicts in Hindsight](https://hindsight.vectorize.io/blog/2026/02/09/resolving-memory-conflicts) — Memory contradiction handling strategies
- [Context Window Management](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/) — Dynamic allocation strategies
- [Embeddings in Production: Costs to Embed](https://medium.com/barnacle-labs/embeddings-in-production-or-how-nothing-scales-like-youd-expect-it-to-part-1-costs-to-embed-a82482765215) — Production scaling issues

### Tertiary (LOW confidence)

- [Comparing File Systems and Databases for AI Agent Memory](https://medium.com/oracledevs/comparing-file-systems-and-databases-for-effective-ai-agent-memory-management-5322ac45f3b6) — File-based vs. database tradeoffs, dual-layer architecture concept
- [Memory Optimization Strategies in AI Agents](https://medium.com/@nirdiamant21/memory-optimization-strategies-in-ai-agents-1f75f8180d54) — Chunking, retrieval, context management (general advice)

---
*Research completed: 2026-02-12*
*Ready for roadmap: yes*
