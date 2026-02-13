# Architecture Research

**Domain:** AI Agent with Persistent Memory, Identity, and HTTP Tool API
**Researched:** 2026-02-12
**Confidence:** HIGH

## Standard Architecture for AI Agents with Memory (2026)

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Surfaces                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Telegram │  │ LiveKit  │  │   iOS    │  │   HTTP   │    │
│  │ Channel  │  │  Voice   │  │   App    │  │   API    │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
├───────┴──────────────┴──────────────┴──────────────┴─────────┤
│                        Gateway Layer                          │
│         (Routes messages, manages surface protocol)           │
├─────────────────────────────────────────────────────────────┤
│                    Agent Orchestrator                         │
│  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Memory System │  │ Tool Registry│  │ Identity Loader │  │
│  │ (semantic +   │  │ (HTTP API +  │  │ (SOUL.md)       │  │
│  │  BM25 search) │  │  MCP bridge) │  │                 │  │
│  └───────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
├──────────┴──────────────────┴──────────────────┴────────────┤
│                      LLM Provider Layer                       │
│    (Claude Code SDK, OpenAI Realtime, pi-ai fallback)        │
├─────────────────────────────────────────────────────────────┤
│                     Storage & Execution                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Vector   │  │ JSONL    │  │ Tool     │  │ Session  │    │
│  │ Index    │  │ Memory   │  │ Exec Env │  │ State    │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Gateway | Message routing, surface protocol handling | HTTP server + channel adapters |
| Agent Orchestrator | Session management, tool coordination, memory integration | Stateful service with LLM SDK integration |
| Memory System | Semantic search, persistence, compaction | Vector DB + JSONL files + embeddings model |
| Tool Registry | Unified tool definitions, execution, HTTP API | Express/Fastify API + tool wrappers |
| Identity Loader | SOUL.md parsing, system prompt injection | File watcher + markdown parser |
| LLM Provider | Model inference, streaming, tool calling | Claude Code SDK / OpenAI Realtime |

## Recommended Project Structure for v2.0

### New Packages Required

```
packages/
├── core/                    # EXISTING — modify for memory + identity
│   ├── src/
│   │   ├── agent.ts         # MODIFY — inject SOUL.md + memory context
│   │   ├── memory/          # NEW — memory system
│   │   │   ├── manager.ts   # MemoryManager class
│   │   │   ├── search.ts    # Hybrid BM25 + vector search
│   │   │   ├── embeddings.ts # Embedding model integration
│   │   │   └── compaction.ts # JSONL log → MEMORY.md
│   │   ├── identity/        # NEW — SOUL.md system
│   │   │   ├── loader.ts    # Load + parse SOUL.md
│   │   │   └── types.ts     # Soul schema types
│   │   └── types.ts         # MODIFY — add memory types
│
├── gateway/                 # EXISTING — minimal changes
│   └── src/
│       └── index.ts         # MODIFY — route /api/tools/* to tool-api
│
├── tool-api/                # NEW — HTTP tool invoke endpoint
│   ├── src/
│   │   ├── server.ts        # Express/Fastify server
│   │   ├── registry.ts      # ToolRegistry class
│   │   ├── routes/
│   │   │   ├── invoke.ts    # POST /tools/:name/invoke
│   │   │   └── list.ts      # GET /tools
│   │   └── auth.ts          # API key validation
│   └── package.json
│
└── livekit-agent/           # EXISTING — modify to use HTTP tool API
    └── src/
        ├── agent.ts         # MODIFY — call HTTP tool API instead of direct
        └── tools.ts         # REMOVE — no longer needed with HTTP API
```

### Workspace Directory Structure

```
~/.jarvis/
├── workspace/               # NEW — OpenClaw-style workspace
│   ├── SOUL.md              # Agent identity, personality, rules
│   ├── MEMORY.md            # Curated long-term memories
│   ├── logs/                # Daily JSONL logs
│   │   ├── 2026-02-12.jsonl
│   │   ├── 2026-02-11.jsonl
│   │   └── ...
│   └── .index/              # Vector embeddings index
│       ├── embeddings.db    # SQLite with pgvector or LanceDB
│       └── metadata.json    # Index metadata
├── sessions/                # EXISTING — per-user session history
│   └── [userId]/
│       └── messages.jsonl
├── preferences/             # EXISTING — user preferences
└── config/                  # EXISTING — mode configs (mapped from project root)
```

### Structure Rationale

- **packages/core/memory/:** Co-located with agent logic because memory loading happens at session start
- **packages/tool-api/:** Separate package because it runs as independent HTTP service (can scale independently)
- **workspace/:** File-based for simplicity, inspectable by humans, git-committable for versioning identity
- **.index/:** Separate from logs because vector indices need rebuild/optimization independent of log rotation

## Architectural Patterns

### Pattern 1: Memory Context Injection

**What:** Load relevant memories into LLM system prompt at session start instead of RAG-style mid-conversation retrieval

**When to use:** For AI agents with conversational continuity needs, where past context informs current behavior

**Trade-offs:**
- **Pro:** Simpler architecture (no mid-conversation retrieval), lower latency (one search upfront)
- **Pro:** Agent sees memories as part of context, can reason about them naturally
- **Con:** Fixed context at session start (new memories from current session not searchable until next session)
- **Con:** Context window consumed by memories (limits turn depth)

**Example:**
```typescript
async function loadSessionContext(userId: string, currentPrompt: string) {
  // 1. Load SOUL.md (identity)
  const soul = await loadSoul();

  // 2. Search memory for relevant context
  const relevantMemories = await memoryManager.search({
    query: currentPrompt,
    limit: 10,
    threshold: 0.7
  });

  // 3. Compose system prompt
  const systemPrompt = `
${soul.content}

## Relevant Memories

${relevantMemories.map(m => `- ${m.content}`).join('\n')}

## Current Conversation

User: ${currentPrompt}
`;

  return systemPrompt;
}
```

### Pattern 2: Hybrid Vector + BM25 Search

**What:** Combine semantic similarity (vector embeddings) with keyword matching (BM25) for robust memory retrieval

**When to use:** When users reference specific terms/names that embeddings might miss, or when semantic drift causes relevance issues

**Trade-offs:**
- **Pro:** Catches both semantic matches ("help with email") and exact matches ("the Linear issue about authentication")
- **Pro:** More robust to embedding model limitations
- **Con:** More complex than pure vector search
- **Con:** Requires maintaining two indices (vector + inverted index)

**Example:**
```typescript
interface SearchResult {
  content: string;
  score: number;
  source: 'vector' | 'bm25';
}

async function hybridSearch(query: string): Promise<SearchResult[]> {
  // Run both searches in parallel
  const [vectorResults, bm25Results] = await Promise.all([
    vectorIndex.search(query, { limit: 20 }),
    bm25Index.search(query, { limit: 20 })
  ]);

  // Merge with reciprocal rank fusion (RRF)
  const merged = mergeWithRRF(vectorResults, bm25Results);

  // Return top K
  return merged.slice(0, 10);
}
```

### Pattern 3: Tool Registry with HTTP API + MCP Bridge

**What:** Single canonical tool registry exposed via HTTP API (for external clients) and in-process MCP server (for Claude Code SDK)

**When to use:** Multi-surface AI agents where tools need to be accessible from different runtimes (Node.js, browser, iOS)

**Trade-offs:**
- **Pro:** Single source of truth for tool definitions and execution
- **Pro:** External surfaces (iOS, web) can call tools over HTTP without embedding tool logic
- **Pro:** Observability — all tool calls flow through one endpoint
- **Con:** HTTP overhead for in-process calls (mitigated by keeping MCP bridge for text agent)
- **Con:** More complex deployment (two tool access paths)

**Example:**
```typescript
// packages/tool-api/src/registry.ts
class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  async invoke(name: string, params: unknown): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool not found: ${name}`);
    return tool.execute(params);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}

// packages/tool-api/src/routes/invoke.ts
app.post('/tools/:name/invoke', async (req, res) => {
  const { name } = req.params;
  const params = req.body;

  try {
    const result = await registry.invoke(name, params);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// packages/livekit-agent/src/agent.ts (MODIFIED)
const tools = await fetch('http://localhost:3457/tools').then(r => r.json());
const toolContext = tools.reduce((ctx, tool) => {
  ctx[tool.name] = llm.tool({
    description: tool.description,
    parameters: zodFromJsonSchema(tool.parameters),
    execute: async (params) => {
      const res = await fetch(`http://localhost:3457/tools/${tool.name}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      return res.json().then(d => d.result);
    }
  });
  return ctx;
}, {});
```

### Pattern 4: Pre-Compaction Memory Flush

**What:** Before compacting daily logs into MEMORY.md, let LLM extract key facts/decisions from raw session data

**When to use:** When logs contain important context that would be lost in naive log rotation (OpenClaw pattern)

**Trade-offs:**
- **Pro:** Preserves important context that BM25/vector search might miss
- **Pro:** Human-readable MEMORY.md serves as audit trail
- **Con:** LLM call overhead during compaction (acceptable if run async/overnight)
- **Con:** Quality depends on prompt engineering for extraction

**Example:**
```typescript
async function compactLogs(startDate: Date, endDate: Date) {
  // 1. Load raw logs
  const logs = await loadLogsBetween(startDate, endDate);

  // 2. Ask LLM to extract key memories
  const prompt = `
Review this conversation log and extract 5-10 key facts, decisions, or context
that should be preserved for future sessions.

Format: One fact per line, starting with a dash.

${logs.map(l => `[${l.timestamp}] ${l.role}: ${l.content}`).join('\n')}
`;

  const extraction = await llm.query(prompt);

  // 3. Append to MEMORY.md
  await appendToMemory(`\n## ${formatDate(endDate)}\n${extraction}\n`);

  // 4. Update vector index with new memories
  await embedAndIndex(extraction);

  // 5. Archive raw logs
  await archiveLogs(startDate, endDate);
}
```

## Data Flow

### Session Start Flow (with Memory + Identity)

```
User sends message
    ↓
Gateway → AgentOrchestrator.handleMessage()
    ↓
Load SOUL.md → Parse identity, personality, rules
    ↓
Semantic search → Query vector index + BM25 for relevant memories
    ↓
Compose system prompt → SOUL.md + top memories + user preferences
    ↓
Claude Code SDK query() → Send prompt with augmented context
    ↓
Stream response → Back to user via Gateway
    ↓
Log to JSONL → ~/.jarvis/workspace/logs/YYYY-MM-DD.jsonl
```

### Tool Invocation Flow (HTTP API)

```
[Text Agent - Claude Code SDK]
    ↓
MCP bridge (in-process) → ToolRegistry.invoke() → Execute tool
    ↓
Return result to LLM

[Voice Agent - LiveKit]
    ↓
HTTP POST /tools/:name/invoke → ToolRegistry.invoke() → Execute tool
    ↓
Return JSON result → Convert to llm.ToolResult

[iOS App]
    ↓
HTTP POST /tools/:name/invoke → ToolRegistry.invoke() → Execute tool
    ↓
Return JSON result → Render tool card in UI
```

### Memory Compaction Flow (Nightly)

```
Cron job triggers at 3am
    ↓
Load today's logs → ~/.jarvis/workspace/logs/YYYY-MM-DD.jsonl
    ↓
LLM extraction → "What key facts/decisions should be preserved?"
    ↓
Append to MEMORY.md → Human-readable curated memories
    ↓
Embed new memories → Generate vector embeddings
    ↓
Update vector index → Add to SQLite/LanceDB
    ↓
Archive logs → Move JSONL to ~/.jarvis/workspace/logs/archive/
```

### Key Data Flows

1. **Identity Loading:** SOUL.md read at every session start, parsed into sections (role, personality, rules, tools), injected into system prompt before first LLM call
2. **Memory Search:** Triggered by user message, runs hybrid search (vector + BM25), returns top 10 results ranked by relevance, formatted into system prompt
3. **Tool Execution:** Text agent uses in-process MCP bridge (low latency), voice/iOS use HTTP API (network overhead acceptable for human-speed interactions)

## Integration Points for v2.0

### New Components in Existing Architecture

| Existing Component | Integration Required | Change Type |
|--------------------|----------------------|-------------|
| AgentOrchestrator | Load SOUL.md + memories at session start | MODIFY |
| AgentOrchestrator.delegateToClaudeCode() | Inject memory context into systemPrompt | MODIFY |
| SessionManager | Write to workspace/logs/ instead of sessions/ | MODIFY |
| Gateway | Route /api/tools/* to tool-api package | ADD ROUTE |
| LiveKit agent | Replace direct tool calls with HTTP API calls | MODIFY |
| Extensions | Register tools with ToolRegistry on init | MODIFY |

### New Packages and Their Interfaces

**@jarvis/tool-api** (new package):
- Exports: `ToolRegistry`, `startToolServer(port: number)`
- HTTP API: `GET /tools`, `POST /tools/:name/invoke`
- Used by: LiveKit agent, iOS app, future web clients

**@jarvis/core/memory** (new module):
- Exports: `MemoryManager`, `loadSoul()`, `searchMemories()`
- Used by: AgentOrchestrator (at session start)

**@jarvis/core/identity** (new module):
- Exports: `loadSoul()`, `Soul` type
- Used by: AgentOrchestrator (at session start)

### Modified Data Flows

**Before v2.0:**
```
User message → Gateway → AgentOrchestrator → Claude Code SDK → Response
                                ↓
                         SessionManager (JSONL in ~/.jarvis/sessions/)
```

**After v2.0:**
```
User message → Gateway → AgentOrchestrator
                              ↓
                         loadSoul() + searchMemories()
                              ↓
                         Claude Code SDK (with memory context)
                              ↓
                         Response + log to workspace/logs/
```

## Build Order Considerations

### Phase 1: Identity System (SOUL.md)
- **New:** `packages/core/src/identity/loader.ts`
- **Modify:** `packages/core/src/agent.ts` (inject SOUL.md into system prompt)
- **Workspace:** Create `~/.jarvis/workspace/SOUL.md`
- **Dependencies:** None (pure file I/O)

### Phase 2: Memory Persistence (JSONL logs)
- **New:** `packages/core/src/memory/manager.ts`
- **Modify:** `SessionManager` to write to workspace/logs/
- **Workspace:** Create `~/.jarvis/workspace/logs/`
- **Dependencies:** Phase 1 (shares workspace structure)

### Phase 3: Semantic Search (Vector + BM25)
- **New:** `packages/core/src/memory/search.ts`, `embeddings.ts`
- **Modify:** `MemoryManager.search()`
- **Workspace:** Create `~/.jarvis/workspace/.index/`
- **Dependencies:** Phase 2 (needs logs to index)

### Phase 4: Tool Registry + HTTP API
- **New:** `packages/tool-api/` (entire package)
- **Modify:** `packages/livekit-agent/src/agent.ts` (use HTTP API)
- **Modify:** Gateway to route `/api/tools/*`
- **Dependencies:** None (can build in parallel with memory phases)

### Phase 5: Memory Compaction
- **New:** `packages/core/src/memory/compaction.ts`
- **Modify:** Cron scheduler to run nightly compaction
- **Workspace:** Write to `~/.jarvis/workspace/MEMORY.md`
- **Dependencies:** Phase 2, 3 (needs logs + vector index)

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user (current) | Monolith is perfect. File-based memory, single VPS, no distributed concerns. |
| 10-100 users | Separate tool-api as microservice (different users hit different tools). Keep memory per-user. Consider Redis for session state. |
| 100+ users | Shard memory by user. Move vector index to dedicated service (Qdrant/Weaviate). Queue tool executions for rate limiting. |

### Scaling Priorities

1. **First bottleneck (20+ users):** Memory search latency. Fix: Move from in-memory BM25 to SQLite FTS5, use dedicated vector DB (LanceDB → Qdrant)
2. **Second bottleneck (50+ users):** Tool API overwhelm. Fix: Add queue (BullMQ) for async tool execution, return job ID immediately, poll for results

**Reality check:** jarvis is single-user. Scaling concerns are theoretical. Keep it simple.

## Anti-Patterns

### Anti-Pattern 1: RAG-Style Memory Retrieval Mid-Conversation

**What people do:** Retrieve memories on every LLM turn, injecting them into context dynamically

**Why it's wrong:**
- Adds latency to every turn (embedding + search + context injection)
- Context pollution — irrelevant memories degrade performance
- Agent can't reason about "what it knows" if knowledge appears/disappears mid-conversation

**Do this instead:** Search once at session start, inject top memories into initial system prompt. Agent has stable context for entire session.

### Anti-Pattern 2: Storing Tools in Vector Database

**What people do:** Embed tool descriptions, retrieve relevant tools based on user query

**Why it's wrong:**
- Tools are code, not documents — they don't benefit from semantic search
- Tool count is small (<50), no need for retrieval
- Increases latency for every tool call

**Do this instead:** Expose all tools to LLM via function calling (MCP bridge). Let model choose based on descriptions in schema.

### Anti-Pattern 3: Separate HTTP API Without MCP Bridge

**What people do:** Force text agent (Claude Code SDK) to call HTTP tool API instead of using in-process MCP

**Why it's wrong:**
- Adds network overhead to in-process calls (10-50ms per tool use)
- Complicates local development (need tool server running)
- Defeats Claude Code SDK's MCP integration strengths

**Do this instead:** Dual-path approach — MCP bridge for text agent (in-process, low latency), HTTP API for external clients (voice, iOS, web)

### Anti-Pattern 4: Bloated SOUL.md

**What people do:** Dump everything into SOUL.md — personality, operational instructions, tool permissions, example conversations

**Why it's wrong:**
- Consumes massive context window (GPT-4 uses ~2k tokens for bloated souls)
- Conflicting directives (personality says "be concise", examples show verbose responses)
- Hard to maintain (every change requires testing entire agent behavior)

**Do this instead:**
- SOUL.md: Identity only (who you are, personality, values, boundaries)
- System prompt: Operational instructions (how to use tools, output format)
- Preferences: User-specific behavioral rules
- Keep SOUL.md under 500 words

## Technology Recommendations

### Memory Storage

**Vector Database:**
- **Best for jarvis:** LanceDB (embedded, serverless, runs in-process)
- **Alternative:** pgvector (if already using Postgres)
- **Avoid:** Pinecone/Weaviate (overkill for single-user, requires external service)

**Rationale:** LanceDB runs inside Node.js process, no separate server. Perfect for single-user VPS deployment.

**BM25 Index:**
- **Best for jarvis:** SQLite FTS5 (built into SQLite, battle-tested)
- **Alternative:** In-memory BM25 implementation (faster, no persistence)

**Rationale:** SQLite already on VPS, FTS5 extension available, handles ~10k documents easily.

### Embedding Model

**Recommended:** `nomic-embed-text-v2` via Ollama (local deployment, multilingual, 768-dim)

**Alternative:** OpenAI `text-embedding-3-small` (API-based, 1536-dim, costs $0.02/1M tokens)

**Rationale:** Ollama runs on same VPS, no external API calls, privacy-preserving, free. OpenAI fallback if VPS resources constrained.

**Deployment:**
```bash
# On srv1312265
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text
```

### Tool API Framework

**Recommended:** Fastify (fast, TypeScript-first, low overhead)

**Alternative:** Express (more familiar, larger ecosystem)

**Rationale:** Fastify has built-in schema validation (JSON Schema), faster than Express, better for API-only services. No SSR needs = no Express benefits.

## Sources

- [AI Agent Memory: Build Stateful AI Systems That Remember](https://redis.io/blog/ai-agent-memory-stateful-systems/)
- [Build persistent memory for agentic AI applications with Mem0](https://aws.amazon.com/blogs/database/build-persistent-memory-for-agentic-ai-applications-with-mem0-open-source-amazon-elasticache-for-valkey-and-amazon-neptune-analytics/)
- [Graph Memory for AI Agents](https://mem0.ai/blog/graph-memory-solutions-ai-agents)
- [Design Patterns for Long-Term Memory in LLM-Powered Architectures](https://serokell.io/blog/design-patterns-for-long-term-memory-in-llm-powered-architectures)
- [RAG is not Agent Memory](https://www.letta.com/blog/rag-vs-agent-memory)
- [MCP Gateways: A Developer's Guide](https://composio.dev/blog/mcp-gateways-guide)
- [APIs for AI Agents: The 5 Integration Patterns](https://composio.dev/blog/apis-ai-agents-integration-patterns)
- [SOUL.md: The Simplest Way to Create an AI Agent](https://www.crewclaw.com/blog/soul-md-create-ai-agent)
- [OpenClaw and the Programmable Soul](https://www.barnacle.ai/blog/2026-02-02-openclaw-and-the-programmable-soul)
- [The Best Open-Source Embedding Models in 2026](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models)
- [Run Embedding Models for Semantic Search](https://www.docker.com/blog/run-embedding-models-for-semantic-search/)

---
*Architecture research for: v2.0 Agent Architecture (Memory, Identity, HTTP Tool API)*
*Researched: 2026-02-12*
