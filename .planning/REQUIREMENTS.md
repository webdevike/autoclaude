# Requirements: Jarvis v2.0 Agent Architecture

**Defined:** 2026-02-12
**Core Value:** A unified AI assistant that remembers context across sessions and surfaces

## v2.0 Requirements

### Workspace

- [ ] **WORK-01**: Agent operates from a workspace directory (~/.jarvis/workspace/) with predictable file layout
- [ ] **WORK-02**: Workspace separates identity files (SOUL.md), memory files (MEMORY.md, memory/), and agent state
- [ ] **WORK-03**: Existing v1.0 data (sessions, preferences) migrated to new workspace structure without loss

### Identity

- [ ] **IDEN-01**: Agent loads SOUL.md from workspace on every session start, injecting it into the system prompt
- [ ] **IDEN-02**: SOUL.md defines personality, boundaries, communication style, and continuity notes
- [ ] **IDEN-03**: User can edit SOUL.md directly; agent reads it but does not write to it without explicit user confirmation

### Memory

- [ ] **MEM-01**: Agent can write durable facts to MEMORY.md (curated long-term knowledge)
- [ ] **MEM-02**: Agent can write daily notes to memory/YYYY-MM-DD.md log files
- [ ] **MEM-03**: Agent loads today's and yesterday's daily logs into context at session start
- [ ] **MEM-04**: Agent has a memory_search tool that returns relevant memory snippets by semantic query
- [ ] **MEM-05**: Agent has a memory_get tool that reads specific memory file content by path
- [ ] **MEM-06**: Memory search uses hybrid vector + BM25 retrieval with configurable weights (default 70/30)
- [ ] **MEM-07**: Memory search gracefully degrades to BM25-only if embedding provider is unavailable
- [ ] **MEM-08**: Memory files are indexed automatically when created or modified

### Tool Registry

- [ ] **TOOL-01**: All tools defined in a single canonical registry (one source of truth for tool name, schema, execute function)
- [ ] **TOOL-02**: Canonical registry generates MCP bridge definitions for the text agent (Claude Code SDK)
- [ ] **TOOL-03**: Canonical registry generates llm.tool() definitions for the LiveKit voice agent
- [ ] **TOOL-04**: Adding a new tool requires editing one place; all surfaces pick it up automatically

### Tool API

- [ ] **API-01**: HTTP endpoint (POST /tools/invoke) accepts tool name + arguments and returns result
- [ ] **API-02**: HTTP endpoint requires authentication (API key or JWT bearer token)
- [ ] **API-03**: HTTP endpoint lists available tools (GET /tools) with schemas
- [ ] **API-04**: jarvis-ios can call tools directly via the HTTP API instead of only through the voice agent
- [ ] **API-05**: Tool execution handles concurrent requests safely (atomic writes, no state corruption)

### Tool Policies

- [ ] **POL-01**: Tools can be enabled/disabled per mode (personal mode vs work mode)
- [ ] **POL-02**: Tool policy configuration stored alongside mode configs
- [ ] **POL-03**: HTTP API respects tool policies — denied tools return 403

## v2.1 Requirements (Deferred)

### Memory Enhancements

- **MEM-D01**: Pre-compaction memory flush (agent saves durable facts before context compaction)
- **MEM-D02**: Session memory indexing (search across past session transcripts)
- **MEM-D03**: Memory citations in search results (source file + line reference)
- **MEM-D04**: Workspace git integration (auto-commit memory changes to private repo)

### Identity Enhancements

- **IDEN-D01**: USER.md for user-specific facts and preferences (separate from SOUL.md)
- **IDEN-D02**: IDENTITY.md for agent name/emoji (like OpenClaw)
- **IDEN-D03**: Personality drift detection and rollback

### Advanced Tools

- **TOOL-D01**: Tool usage analytics (which tools used most, latency tracking)
- **TOOL-D02**: Tool result caching for expensive operations

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-model embedding ensemble | Can't mix dimensionalities in one index; single model per index is correct |
| Real-time memory sync across sessions | File watchers + race conditions; next-session-start is simpler |
| Vector DB as external service | Over-engineering for single user; SQLite + sqlite-vec is sufficient |
| Automatic memory categorization | Tags drift without criteria; two-tier (MEMORY.md + daily logs) is enough |
| Memory compaction/summarization | Risk of detail loss; disk is cheap, keep all daily logs |
| Infinite context injection | $1.20/message at scale; selective retrieval is 200x cheaper |
| Multi-user support | Single user (Ike), single VPS |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WORK-01 | — | Pending |
| WORK-02 | — | Pending |
| WORK-03 | — | Pending |
| IDEN-01 | — | Pending |
| IDEN-02 | — | Pending |
| IDEN-03 | — | Pending |
| MEM-01 | — | Pending |
| MEM-02 | — | Pending |
| MEM-03 | — | Pending |
| MEM-04 | — | Pending |
| MEM-05 | — | Pending |
| MEM-06 | — | Pending |
| MEM-07 | — | Pending |
| MEM-08 | — | Pending |
| TOOL-01 | — | Pending |
| TOOL-02 | — | Pending |
| TOOL-03 | — | Pending |
| TOOL-04 | — | Pending |
| API-01 | — | Pending |
| API-02 | — | Pending |
| API-03 | — | Pending |
| API-04 | — | Pending |
| API-05 | — | Pending |
| POL-01 | — | Pending |
| POL-02 | — | Pending |
| POL-03 | — | Pending |

**Coverage:**
- v2.0 requirements: 26 total
- Mapped to phases: 0
- Unmapped: 26

---
*Requirements defined: 2026-02-12*
*Last updated: 2026-02-12 after initial definition*
