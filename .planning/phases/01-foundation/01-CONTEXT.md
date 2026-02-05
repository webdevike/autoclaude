# Phase 1: Foundation - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace custom LLMClient with pi-ai and custom agent loop with pi-agent-core. Gain streaming, multi-provider support, token/cost tracking, and session persistence. This is an internal migration — no new user-facing features, but the underlying engine changes completely.

</domain>

<decisions>
## Implementation Decisions

### Streaming behavior
- Typing indicator shown in Telegram while generating (not a placeholder message)
- Claude decides update frequency/chunking strategy based on Telegram rate limits and UX
- Claude decides how to handle responses exceeding Telegram's 4096 char limit
- Tool usage shown to user during execution — messages like "Reading email..." or "Searching Linear..." while tools run

### Session persistence
- Recent window of last 50 messages persists across restarts
- Old messages beyond the window are deleted (no archival)
- On restart, agent sends brief notice ("Back online") then continues naturally

### Claude's Discretion
- Streaming update strategy (sentence chunks, timed intervals, or hybrid)
- Long response handling (split messages vs truncation)
- Provider routing — default provider/model selection, fallback strategy, triage model routing
- Cost tracking implementation — logging, daily summaries, where cost data surfaces
- Exact persistence format and storage mechanism

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The existing gateway pattern, triage logic, and integrations should be preserved during migration.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-05*
