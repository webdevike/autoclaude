# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** A unified AI assistant that remembers context across sessions and surfaces
**Current focus:** LiveKit gateway unification — defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-13 — v2.0 scope pivoted to LiveKit gateway unification (phases 6-9 replaced)

## Performance Metrics

**Velocity:**
- Total plans completed: 13 (11 from v1.0, 2 from v2.0)
- Average duration: 2.5 minutes (v2.0 only)
- v1.0 execution time: ~2 days (2026-02-05 → 2026-02-06)
- v2.0 execution time: 5 minutes total (2026-02-12)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Pi-AI Integration | 3 | - | - |
| 2. Agent Core & Extensions | 3 | - | - |
| 3. Preferences & Configuration | 3 | - | - |
| 4. Cron Execution | 2 | - | - |
| 5. Workspace & Identity | 2 | 5 min | 2.5 min |

**Recent Trend:**
- Phase 5 maintaining velocity: 2 min for foundation, 3 min for integration/migration

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting v2.0 work:

- **OpenClaw-style workspace + memory**: File-based memory (MEMORY.md + daily logs), semantic search with vector + BM25 hybrid retrieval, identity persistence via SOUL.md
- **HTTP tool invoke API**: Single tool endpoint accessible from all surfaces (Telegram, LiveKit, iOS app, CLI) with bearer token authentication
- **Claude Code SDK as default agent**: Powerful tool use, streaming, session resumption - replaced pi-coding-agent in v1.0
- **SOUL.md character limits** (Phase 5): Warning at 6000 chars (~1500 tokens), hard error at 12000 chars (~3000 tokens) to balance expressiveness with context budget
- **Best-effort git operations** (Phase 5): Git failures log warnings but never throw errors - audit trail is valuable but not critical to agent operations
- **v1.0 migration strategy** (Phase 5): Copy (not move) v1.0 data to workspace with idempotent marker file - preserves backups and runs safely on every startup
- **SOUL.md injection** (Phase 5): Workspace prepends SOUL.md to system prompt for both Claude Code and Pi-AI agent paths - identity now drives every message

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
- ~~v1.0 data migration: Existing sessions and preferences must work from new workspace location without data loss. Backward compatibility required.~~ **RESOLVED in 05-02**: Migration implemented with copy strategy (preserves backups) and idempotent marker file.

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

Last session: 2026-02-13 - v2.0 scope pivot, defining requirements
Stopped at: New milestone initialization
Resume file: None
