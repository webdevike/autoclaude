# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-13)

**Core value:** A unified AI assistant that remembers context across sessions and surfaces
**Current focus:** Phase 6 - HTTP API Foundation

## Current Position

Phase: 6 of 8 (HTTP API Foundation)
Plan: 2 of 2 complete
Status: Complete
Last activity: 2026-02-13 — Completed 06-02-PLAN.md (CLI integration)

Progress: [████████░░░░░░░░░░] 44% (15/34 total plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 15 (11 from v1.0, 4 from v2.0)
- Average duration: 2.2 minutes (v2.0 only)
- v1.0 execution time: ~2 days (2026-02-05 → 2026-02-06)
- v2.0 execution time: 8.6 minutes total (2026-02-12 to 2026-02-13)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Pi-AI Integration | 3 | - | - |
| 2. Agent Core & Extensions | 3 | - | - |
| 3. Preferences & Configuration | 3 | - | - |
| 4. Cron Execution | 2 | - | - |
| 5. Workspace & Identity | 2 | 5 min | 2.5 min |
| 6. HTTP API Foundation | 2/2 | 3.6 min | 1.8 min |

**Recent Trend:**
- Phase 6 plans: 2.2 min (HTTP API module), 1.4 min (CLI integration)
- Phase 6 complete - HTTP API foundation operational
- Consistent velocity maintained across v2.0 phases

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting v2.0 work:

- **HTTP API automatic startup** (Phase 6, Plan 2): HTTP API starts automatically in CLI after gateway.start(), uses same orchestrator instance as Telegram for identical behavior
- **Internal HTTP API for LK→gateway** (Phase 6, Plan 1): Lightweight Hono server on localhost:3457, reuses orchestrator code path (same as Telegram). No auth needed - localhost-only binding provides sufficient isolation.
- **Tool name collection via onProgress** (Phase 6, Plan 1): Collect tool names by filtering tool_use events in onProgress callback during orchestrator.handleMessage execution
- **Hono framework choice** (Phase 6, Plan 1): Chosen for lightweight footprint (~12KB), modern API, excellent TypeScript support
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

**Phase 6 (HTTP API Foundation) - COMPLETE:**
- ✅ Plan 1 complete: HTTP API module created with Hono server on localhost:3457
- ✅ Plan 2 complete: HTTP API wired into CLI startup sequence
- ✅ Tool name collection implemented via onProgress callback
- Data channel contracts need documentation (message types, JSON schemas) for iOS team (future work)

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

Last session: 2026-02-13 - Phase 6 Plan 2 execution
Stopped at: Completed 06-02-PLAN.md (CLI Integration) - Phase 6 complete
Resume file: None

**Session metrics:**
- Duration: 1.4 minutes (86 seconds)
- Tasks completed: 1/1
- Commits: 1 (412534e)
- Files modified: 1 (packages/cli/src/index.ts)
