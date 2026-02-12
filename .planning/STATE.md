# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** A unified AI assistant that remembers context across sessions and surfaces
**Current focus:** Phase 5 - Workspace & Identity Foundation

## Current Position

Phase: 5 of 9 (Workspace & Identity Foundation)
Plan: N/A - Phase not yet planned
Status: Ready to plan
Last activity: 2026-02-12 - v2.0 Agent Architecture roadmap created

Progress: [████░░░░░░] 44% (11/25 plans total, 11 from v1.0 complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 11 (v1.0 only)
- Average duration: Unknown (no timing data from v1.0)
- Total execution time: ~2 days (2026-02-05 → 2026-02-06)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Pi-AI Integration | 3 | - | - |
| 2. Agent Core & Extensions | 3 | - | - |
| 3. Preferences & Configuration | 3 | - | - |
| 4. Cron Execution | 2 | - | - |

**Recent Trend:**
- v2.0 just starting - no trend data yet

*Velocity tracking will resume after first v2.0 plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting v2.0 work:

- **OpenClaw-style workspace + memory**: File-based memory (MEMORY.md + daily logs), semantic search with vector + BM25 hybrid retrieval, identity persistence via SOUL.md
- **HTTP tool invoke API**: Single tool endpoint accessible from all surfaces (Telegram, LiveKit, iOS app, CLI) with bearer token authentication
- **Claude Code SDK as default agent**: Powerful tool use, streaming, session resumption - replaced pi-coding-agent in v1.0

Key patterns from v1.0:
- Confirmation flow for all config changes
- Atomic writes with TypeBox validation
- Extension API for integrations
- Best-effort git commits for audit trail

### Pending Todos

None yet.

### Blockers/Concerns

**Phase 5 (Workspace & Identity):**
- SOUL.md security: Must prevent prompt injection attacks. Agent should NOT write to SOUL.md without explicit confirmation. Git integrity checks required.
- Context window budget: SOUL.md (500-2k tokens) + memory search (1k-5k) + tool definitions (2k-10k) compete for context. Need explicit budget allocation from day one.
- v1.0 data migration: Existing sessions and preferences must work from new workspace location without data loss. Backward compatibility required.

**Phase 7 (Semantic Memory Search):**
- Memory contradiction accumulation: Vector search doesn't understand temporal relationships. "User prefers coffee" vs "User stopped drinking coffee" need conflict resolution with recency weighting.
- Embedding provider: Research recommends local model (Transformers.js + bge-small-en-v1.5) for privacy and zero API costs, but VPS srv1312265 resource capacity (RAM, CPU) not verified.

**Phase 8 (Tool API):**
- HTTP authentication: Tool invoke endpoint needs auth from day one (API key minimum, JWT better). Anyone on Tailscale network could control agent without it.
- Concurrent tool execution: Multiple surfaces invoking tools simultaneously creates race conditions in file writes and OAuth token refresh. Needs atomic writes and distributed locks.

### Tech Debt (from v1.0)

- CLI uses old @jarvis/integration-* packages alongside @jarvis/extensions/*
- Tools defined separately per surface (MCP bridge for text, llm.tool() for voice) - Phase 8 will unify

## Session Continuity

Last session: 2026-02-12 - v2.0 milestone start
Stopped at: Roadmap creation for v2.0 Agent Architecture
Resume file: None
