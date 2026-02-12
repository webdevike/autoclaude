# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** A unified AI assistant that remembers context across sessions and surfaces
**Current focus:** v2.0 — Agent Architecture (memory, identity, shared tools)

## Current Position

Milestone: v2.0 Agent Architecture — Not started
Status: Defining requirements
Last activity: 2026-02-12 — Milestone v2.0 started

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

Key patterns established in v1.0:
- Confirmation flow for all config changes
- Atomic writes with TypeBox validation
- Extension API for integrations
- Best-effort git commits for audit trail
- Claude Code SDK as default agent (provider: "claude-code")

### Tech Debt (from v1.0)

- CLI uses old @jarvis/integration-* packages alongside @jarvis/extensions/*
- Tools defined separately per surface (MCP bridge for text, llm.tool() for voice)
- v1.0 docs say cron is a stub but it's fully implemented — stale docs

### Blockers/Concerns

None currently.

## Session Continuity

Last session: 2026-02-12
Stopped at: Milestone v2.0 initialized, defining requirements
Resume file: None
