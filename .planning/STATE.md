# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-13)

**Core value:** A unified AI assistant that remembers context across sessions and surfaces
**Current focus:** Phase 7 - Text Message Routing

## Current Position

Phase: 7 of 8 (Text Message Routing)
Plan: 1 of 2 complete
Status: In progress
Last activity: 2026-02-13 — Phase 7 Plan 1 complete (text routing), ready for Plan 2 (iOS interface)

Progress: [█████████░░░░░░░░░] 47% (16/34 total plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 16 (11 from v1.0, 5 from v2.0)
- Average duration: 1.9 minutes (v2.0 only)
- v1.0 execution time: ~2 days (2026-02-05 → 2026-02-06)
- v2.0 execution time: 9.6 minutes total (2026-02-12 to 2026-02-13)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Pi-AI Integration | 3 | - | - |
| 2. Agent Core & Extensions | 3 | - | - |
| 3. Preferences & Configuration | 3 | - | - |
| 4. Cron Execution | 2 | - | - |
| 5. Workspace & Identity | 2 | 5 min | 2.5 min |
| 6. HTTP API Foundation | 2/2 | 3.6 min | 1.8 min |
| 7. Text Message Routing | 1/2 | 1.0 min | 1.0 min |

**Recent Trend:**
- Phase 7 Plan 1: 59 seconds (data channel text routing)
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
- [Phase 07-01]: Native fetch for HTTP client (Node 18+ built-in, no dependencies needed)
- [Phase 07-01]: Error responses sent to iOS via data channel (user-facing fallback message)
- [Phase 07-01]: Tool names sent separately via function_tools_executed message (matches iOS useToolResults expectations)

### Pending Todos

None yet.

### Blockers/Concerns

**Phase 7 (Text Message Routing) - IN PROGRESS:**
- ✅ Plan 1 complete: LiveKit agent data channel listener routes text to gateway HTTP API
- Message contracts established: user_text, agent_text_response, function_tools_executed
- Ready for Plan 2: iOS text interface implementation (jarvis-ios project)

**Phase 6 (HTTP API Foundation) - COMPLETE:**
- ✅ Plan 1 complete: HTTP API module created with Hono server on localhost:3457
- ✅ Plan 2 complete: HTTP API wired into CLI startup sequence
- ✅ Tool name collection implemented via onProgress callback

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

Last session: 2026-02-13 - Phase 7 Plan 1 execution complete
Stopped at: Completed 07-01-PLAN.md
Resume file: None

**Session metrics:**
- Duration: 59 seconds
- Tasks completed: 1/1
- Commits: 1 (37b9b48)
- Files modified: 1 (packages/livekit-agent/src/agent.ts)
