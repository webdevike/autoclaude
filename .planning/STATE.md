# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-13)

**Core value:** A unified AI assistant that remembers context across sessions and surfaces
**Current focus:** Phase 6 - HTTP API Foundation

## Current Position

Phase: 6 of 8 (HTTP API Foundation)
Plan: Ready to plan (0/2 plans)
Status: Ready to plan
Last activity: 2026-02-13 — v2.0 roadmap created (phases 6-8 replace old phases 6-9)

Progress: [████████░░░░░░░░░░] 38% (13/34 total plans)

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

- **Internal HTTP API for LK→gateway** (Phase 6): Lightweight Hono server on localhost:3457, reuses orchestrator code path (same as Telegram)
- **OpenClaw-style workspace + memory**: SOUL.md identity shipped in Phase 5, memory (MEMORY.md + semantic search) deferred to future milestone
- **Claude Code SDK as default agent**: Powerful tool use, streaming, session resumption
- **SOUL.md injection** (Phase 5): Workspace prepends SOUL.md to system prompt for both Claude Code and Pi-AI agent paths

Key patterns from v1.0:
- Confirmation flow for all config changes
- Atomic writes with TypeBox validation
- Extension API for integrations
- Best-effort git commits for audit trail

### Pending Todos

None yet.

### Blockers/Concerns

**Phase 6 (HTTP API Foundation):**
- HTTP API is localhost-only internal communication layer — no auth needed (gateway and LiveKit agent on same VPS)
- Must collect tool_use events during orchestrator execution to return tool names in response
- Data channel contracts need documentation (message types, JSON schemas) for iOS team

**Future (Memory - deferred):**
- Memory contradiction accumulation: Vector search doesn't understand temporal relationships
- Embedding provider: Research recommends local model (Transformers.js + bge-small-en-v1.5) but VPS resource capacity not verified

**Future (Tool Registry - deferred):**
- HTTP authentication: If tool invoke endpoint exposed beyond localhost, needs auth from day one
- Concurrent tool execution: Multiple surfaces invoking tools simultaneously creates race conditions

### Tech Debt (from v1.0)

- CLI uses old @jarvis/integration-* packages alongside @jarvis/extensions/*
- Tools defined separately per surface (MCP bridge for text, llm.tool() for voice) - future registry will unify

## Session Continuity

Last session: 2026-02-13 - v2.0 roadmap creation
Stopped at: Roadmap complete, ready to plan Phase 6
Resume file: None
