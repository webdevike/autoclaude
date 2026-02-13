# Requirements: Jarvis v2.0

**Defined:** 2026-02-12 (workspace/identity), 2026-02-13 (gateway unification)
**Core Value:** A unified AI assistant that remembers context across sessions and surfaces

## v2.0 Requirements

### Workspace (Phase 5 — Complete)

- [x] **WORK-01**: Agent operates from a workspace directory (~/.jarvis/workspace/) with predictable file layout
- [x] **WORK-02**: Workspace separates identity files (SOUL.md), memory files (MEMORY.md, memory/), and agent state
- [x] **WORK-03**: Existing v1.0 data (sessions, preferences) migrated to new workspace structure without loss

### Identity (Phase 5 — Complete)

- [x] **IDEN-01**: Agent loads SOUL.md from workspace on every session start, injecting it into the system prompt
- [x] **IDEN-02**: SOUL.md defines personality, boundaries, communication style, and continuity notes
- [x] **IDEN-03**: User can edit SOUL.md directly; agent reads it but does not write to it without explicit user confirmation

### HTTP API

- [ ] **API-01**: Gateway process exposes POST /api/message endpoint on localhost:3457
- [ ] **API-02**: Endpoint accepts { sender, text, mode? } and returns { text, toolsUsed }
- [ ] **API-03**: Endpoint routes through orchestrator (same code path as Telegram)
- [ ] **API-04**: Endpoint collects tool_use events during execution and returns tool names in response

### Text Routing

- [ ] **TEXT-01**: LiveKit agent listens for `user_text` messages on data channel
- [ ] **TEXT-02**: LiveKit agent forwards text messages to gateway HTTP API
- [ ] **TEXT-03**: LiveKit agent sends text responses back via data channel as `agent_text_response`
- [ ] **TEXT-04**: LiveKit agent sends tool usage via data channel as `function_tools_executed`

### Voice Tool Forwarding

- [ ] **VOICE-01**: LiveKit agent listens for `function_tools_executed` events from OpenAI Realtime session
- [ ] **VOICE-02**: LiveKit agent forwards voice tool results to iOS via data channel as structured JSON

### Integration

- [ ] **INT-01**: CLI process starts HTTP API after gateway.start()
- [ ] **INT-02**: Gateway package exports startHttpApi from http-api module
- [ ] **INT-03**: Hono and @hono/node-server added to gateway package dependencies

## Future Requirements (Deferred from v2.0 original scope)

### Memory

- **MEM-01**: Agent can write durable facts to MEMORY.md (curated long-term knowledge)
- **MEM-02**: Agent can write daily notes to memory/YYYY-MM-DD.md log files
- **MEM-03**: Agent loads today's and yesterday's daily logs into context at session start
- **MEM-04**: Agent has a memory_search tool that returns relevant memory snippets by semantic query
- **MEM-05**: Agent has a memory_get tool that reads specific memory file content by path
- **MEM-06**: Memory search uses hybrid vector + BM25 retrieval with configurable weights (default 70/30)
- **MEM-07**: Memory search gracefully degrades to BM25-only if embedding provider is unavailable
- **MEM-08**: Memory files are indexed automatically when created or modified

### Tool Registry

- **TOOL-01**: All tools defined in a single canonical registry (one source of truth)
- **TOOL-02**: Canonical registry generates MCP bridge definitions for text agent
- **TOOL-03**: Canonical registry generates llm.tool() definitions for voice agent
- **TOOL-04**: Adding a new tool requires editing one place; all surfaces pick it up automatically

### Tool Policies

- **POL-01**: Tools can be enabled/disabled per mode (personal mode vs work mode)
- **POL-02**: Tool policy configuration stored alongside mode configs
- **POL-03**: HTTP API respects tool policies — denied tools return 403

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full tool result capture for text path | Requires extending Claude Code delegate to intercept tool_result content blocks — follow-up enhancement |
| Streaming text responses (SSE) | Add SSE streaming to HTTP API later — not needed for initial unification |
| iOS agent_text_response rendering | iOS may need update to render text responses from data channel — iOS-side change, not jarvis |
| Multi-user support | Single user (Ike), single VPS |
| External tool API (non-localhost) | HTTP API is localhost-only for internal process communication, not a public endpoint |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WORK-01 | Phase 5 | Complete |
| WORK-02 | Phase 5 | Complete |
| WORK-03 | Phase 5 | Complete |
| IDEN-01 | Phase 5 | Complete |
| IDEN-02 | Phase 5 | Complete |
| IDEN-03 | Phase 5 | Complete |
| API-01 | — | Pending |
| API-02 | — | Pending |
| API-03 | — | Pending |
| API-04 | — | Pending |
| TEXT-01 | — | Pending |
| TEXT-02 | — | Pending |
| TEXT-03 | — | Pending |
| TEXT-04 | — | Pending |
| VOICE-01 | — | Pending |
| VOICE-02 | — | Pending |
| INT-01 | — | Pending |
| INT-02 | — | Pending |
| INT-03 | — | Pending |

**Coverage:**
- v2.0 requirements: 19 total (6 complete, 13 new)
- Mapped to phases: 6 (Phase 5)
- Unmapped: 13 (awaiting roadmap)

---
*Requirements defined: 2026-02-12 (workspace/identity), 2026-02-13 (gateway unification)*
*Last updated: 2026-02-13 after v2.0 scope pivot*
