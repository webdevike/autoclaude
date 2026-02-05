# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-05)

**Core value:** A single Telegram interface that intelligently routes between fast responses and deep work
**Current focus:** Phase 2 - Integrations

## Current Position

Phase: 2 of 4 (Integrations)
Plan: 3 of 3 in current phase
Status: Phase complete
Last activity: 2026-02-05 — Completed 02-03-PLAN.md (Coding Agent Delegation)

Progress: [██████░░░░] 60%

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 2.7 minutes
- Total execution time: 0.28 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3/3 | 10 min | 3.3 min |
| 02-integrations | 3/3 | 7 min | 2.3 min |

**Recent Trend:**
- Last 5 plans: 02-01 (1 min), 02-02 (3 min), 02-03 (3 min)
- Trend: Steady execution with small variations

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

**From Roadmap:**
- Roadmap creation: Compressed research's 6-phase structure into 4 phases for depth=quick setting
- Foundation phase: Combined LLM migration and agent loop migration (research Phases 1-2) for faster delivery
- Integrations phase: Includes pi-coding-agent integration (research Phase 5) to complete tool ecosystem early
- Autonomy phase: Deferred until Phase 4 to ensure stable foundation and memory system first

**From Plan 01-01:**
- Pi-ai unified API: Use pi-ai for all LLM calls instead of direct SDK usage - eliminates 253 lines of custom provider code, adds 20+ providers
- Compatibility shim: Keep LLMClient class temporarily for agent.ts compatibility until Plan 02 rewrites agent loop
- Throttled streaming: Implement 1-second throttle on Telegram message edits to respect rate limits

**From Plan 01-02:**
- Agent loop replacement: Use pi-agent-core Agent class for event-driven execution (eliminates 20-turn limit, enables streaming progress)
- Tool validation: Convert tools to TypeBox schemas for runtime validation before execution
- Session persistence: JSONL format at ~/.jarvis/sessions/{userId}/messages.jsonl (append-only, last 50 messages, 2x compaction)
- Cost tracking: MODEL_COSTS map with per-token pricing, cost logged per request in USD
- CLI simplification: Remove LLMClient, TmuxManager, StatusReporter from CLI (status reporter deferred to Phase 2)

**From Plan 01-03:**
- Empty message guards: Use "..." as fallback for Telegram channel (minimal noise), descriptive message at gateway level
- Two-layer defense: Guard at both gateway (user-facing) and channel (API safety) levels for robustness

**From Plan 02-01:**
- TypeBox for tool schemas: Use TypeBox for tool parameter schemas instead of plain JSON schema (runtime validation, type inference)
- Output truncation: Truncate Read/Bash output to 50KB/2000 lines to prevent LLM context overflow
- Edit tool safety: Require unique match by default, use replace_all flag for intentional multi-replacement
- Context-aware tools: Tools accept cwd parameter for proper path resolution in different modes

**From Plan 02-02:**
- Extension API for integrations: Use pi-coding-agent Extension format for all integrations (lifecycle management, hot-reload potential)
- AgentToolResult format: Tool results must have content array + details object (pi-agent-core requirement)
- Environment-based initialization: Extensions initialize from environment variables (simpler than config files)

**From Plan 02-03:**
- Three-tier delegation: Triage handles simple questions, pi-coding-agent handles coding tasks, smart agent handles complex reasoning
- CODING: prefix in triage for file operations, shell commands, code analysis (separate from DELEGATE:)
- Tmux visibility: Coding agent sessions run in jarvis-agents tmux session with per-task windows
- spawnSync for tmux: Synchronous window management ensures cleanup in finally blocks

### Pending Todos

None yet.

### Blockers/Concerns

None currently.

## Session Continuity

Last session: 2026-02-05 22:35 UTC
Stopped at: Completed 02-03-PLAN.md (Coding Agent Delegation)
Resume file: None
