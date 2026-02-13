# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-13)

**Core value:** A unified AI assistant that remembers context across sessions and surfaces
**Current focus:** Phase 8 - Voice Tool Forwarding

## Current Position

Phase: 8 of 8 (Voice Tool Forwarding)
Plan: Ready to plan (0/1 plans)
Status: Ready to plan
Last activity: 2026-02-13 — Phase 7 complete, verified, ready for Phase 8

Progress: [█████████░░░░░░░░░] 50% (17/34 total plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 17 (11 from v1.0, 6 from v2.0)
- Average duration: 2.0 minutes (v2.0 only)
- v1.0 execution time: ~2 days (2026-02-05 → 2026-02-06)
- v2.0 execution time: 10.8 minutes total (2026-02-12 to 2026-02-13)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Pi-AI Integration | 3 | - | - |
| 2. Agent Core & Extensions | 3 | - | - |
| 3. Preferences & Configuration | 3 | - | - |
| 4. Cron Execution | 2 | - | - |
| 5. Workspace & Identity | 2 | 5 min | 2.5 min |
| 6. HTTP API Foundation | 2/2 | 3.6 min | 1.8 min |
| 7. Text Message Routing | 2/2 | 2.2 min | 1.1 min |

**Recent Trend:**
- Phase 7 Plan 2: 72 seconds (gateway health verification)
- Phase 7 Plan 1: 59 seconds (data channel text routing)
- Phase 7 complete - Text routing with resilient gateway connectivity
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
- [Phase 07-02]: Health check timeout prevents hanging (3s for localhost health endpoint)
- [Phase 07-02]: Non-blocking prewarm health check allows agent to start even if gateway is slow
- [Phase 07-02]: Auto-recovery on next message after gateway becomes available (no restart needed)

### Pending Todos

None yet.

### Blockers/Concerns

**Phase 7 (Text Message Routing) - COMPLETE:**
- ✅ Plan 1 complete: LiveKit agent data channel listener routes text to gateway HTTP API
- ✅ Plan 2 complete: Gateway health verification with retry logic and graceful degradation
- Message contracts established: user_text, agent_text_response, function_tools_executed
- Auto-recovery when gateway starts or restarts (no manual intervention needed)
- Ready for iOS text interface implementation (jarvis-ios project)

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

Last session: 2026-02-13 - Phase 7 execution complete
Stopped at: Phase 7 verified and complete. Ready to plan Phase 8.
Resume file: None
