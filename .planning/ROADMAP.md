# Roadmap: Jarvis

## Milestones

- ✅ **v1.0 Pi-Mono Migration** - Phases 1-4 (shipped 2026-02-06)
- 🚧 **v2.0 LiveKit Gateway Unification** - Phases 5-8 (in progress)

## Phases

<details>
<summary>✅ v1.0 Pi-Mono Migration (Phases 1-4) - SHIPPED 2026-02-06</summary>

### Phase 1: Pi-AI Integration
**Goal**: Replace custom LLM code with pi-ai unified API
**Plans**: 3 plans

Plans:
- [x] 01-01: Core pi-ai integration with streaming
- [x] 01-02: Multi-provider support and cost tracking
- [x] 01-03: Migration and testing

### Phase 2: Agent Core & Extensions
**Goal**: Event-driven agent loop with hot-reloadable integrations
**Plans**: 3 plans

Plans:
- [x] 02-01: Pi-agent-core integration with TypeBox validation
- [x] 02-02: Extension API and lifecycle management
- [x] 02-03: Gmail, Linear, Notion, Exa extensions

### Phase 3: Preferences & Configuration
**Goal**: Persistent agent preferences with self-configuration tools
**Plans**: 3 plans

Plans:
- [x] 03-01: Preferences storage with confirmation flow
- [x] 03-02: Dynamic mode switching
- [x] 03-03: Self-configuration tools (cron, config, shortcuts)

### Phase 4: Cron Execution
**Goal**: Full cron job execution with prompt orchestration
**Plans**: 2 plans

Plans:
- [x] 04-01: Cron executor integration with orchestrator
- [x] 04-02: End-to-end execution testing

</details>

### 🚧 v2.0 LiveKit Gateway Unification (In Progress)

**Milestone Goal:** Route iOS text messages through the gateway orchestrator so iOS gets the same tools, SOUL.md, session continuity, and modes as Telegram. Forward voice tool results to iOS as structured JSON for tool cards.

#### Phase 5: Workspace & Identity Foundation
**Goal**: Establish workspace structure with SOUL.md identity system and migrate v1.0 data
**Depends on**: Phase 4
**Requirements**: WORK-01, WORK-02, WORK-03, IDEN-01, IDEN-02, IDEN-03
**Success Criteria** (what must be TRUE):
  1. Agent operates from ~/.jarvis/workspace/ with predictable file layout (SOUL.md, MEMORY.md, memory/, sessions/, preferences/)
  2. Agent loads SOUL.md at session start and injects personality/boundaries into system prompt consistently
  3. User can edit SOUL.md directly; agent reads it but never writes without explicit confirmation
  4. Existing v1.0 session logs and preferences work from new workspace location without data loss
  5. Git tracks all SOUL.md changes with timestamps for audit trail
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md — WorkspaceManager + WorkspaceGit foundation (SOUL.md loading, workspace init, git audit trail)
- [x] 05-02-PLAN.md — v1.0 data migration + agent integration (wire SOUL.md into system prompt, CLI startup)

#### Phase 6: HTTP API Foundation
**Goal**: Internal HTTP API exposing gateway orchestrator for LiveKit agent communication
**Depends on**: Phase 5
**Requirements**: API-01, API-02, API-03, API-04, INT-01, INT-02, INT-03
**Success Criteria** (what must be TRUE):
  1. Gateway process exposes POST /api/message endpoint on localhost:3457 accepting sender, text, and optional mode
  2. Endpoint routes through orchestrator using same code path as Telegram (tools, SOUL.md, session continuity, modes all work)
  3. Endpoint returns text response and list of tool names used during execution
  4. HTTP API starts automatically when CLI starts gateway (no manual intervention required)
**Plans**: 2 plans

Plans:
- [x] 06-01-PLAN.md — HTTP API module (Hono server, /api/message endpoint, orchestrator routing)
- [x] 06-02-PLAN.md — CLI integration (export startHttpApi, wire into startup after gateway.start())

#### Phase 7: Text Message Routing
**Goal**: LiveKit agent routes iOS text messages through gateway HTTP API
**Depends on**: Phase 6
**Requirements**: TEXT-01, TEXT-02, TEXT-03, TEXT-04
**Success Criteria** (what must be TRUE):
  1. LiveKit agent listens for user_text messages on data channel from iOS app
  2. LiveKit agent forwards text messages to gateway HTTP API at localhost:3457
  3. LiveKit agent sends text responses back to iOS via data channel as agent_text_response messages
  4. LiveKit agent sends tool usage list to iOS via data channel as function_tools_executed messages with tool names
  5. iOS text messages receive same SOUL.md personality, orchestrator tools, and mode behavior as Telegram
**Plans**: 2 plans

Plans:
- [x] 07-01-PLAN.md — Data channel listener + HTTP API routing + response forwarding (user_text handler, gateway POST, agent_text_response + function_tools_executed messages)
- [x] 07-02-PLAN.md — Gateway health check + resilient connectivity (startup health verification, retry logic, graceful degradation)

#### Phase 8: Voice Tool Forwarding
**Goal**: Voice tool results forwarded to iOS as structured JSON for tool cards
**Depends on**: Phase 6 (needs HTTP API concepts, independent of text routing)
**Requirements**: VOICE-01, VOICE-02
**Success Criteria** (what must be TRUE):
  1. LiveKit agent listens for function_tools_executed events from OpenAI Realtime session during voice interactions
  2. LiveKit agent forwards voice tool results to iOS via data channel as structured JSON with tool name, arguments, and result
  3. iOS receives tool cards for both text path (Phase 7) and voice path tools
**Plans**: 1 plan

Plans:
- [x] 08-01-PLAN.md — Voice tool event listener and data channel forwarding

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 → 8

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Pi-AI Integration | v1.0 | 3/3 | Complete | 2026-02-06 |
| 2. Agent Core & Extensions | v1.0 | 3/3 | Complete | 2026-02-06 |
| 3. Preferences & Configuration | v1.0 | 3/3 | Complete | 2026-02-06 |
| 4. Cron Execution | v1.0 | 2/2 | Complete | 2026-02-06 |
| 5. Workspace & Identity Foundation | v2.0 | 2/2 | Complete | 2026-02-12 |
| 6. HTTP API Foundation | v2.0 | 2/2 | Complete | 2026-02-13 |
| 7. Text Message Routing | v2.0 | 2/2 | Complete | 2026-02-13 |
| 8. Voice Tool Forwarding | v2.0 | 1/1 | Complete | 2026-02-13 |
