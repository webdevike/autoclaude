# Roadmap: Jarvis

## Milestones

- ✅ **v1.0 Pi-Mono Migration** - Phases 1-4 (shipped 2026-02-06)
- 🚧 **v2.0 Agent Architecture** - Phases 5-9 (in progress)

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

### 🚧 v2.0 Agent Architecture (In Progress)

**Milestone Goal:** Transform jarvis from Telegram-centric agent into OpenClaw-inspired multi-surface assistant with persistent searchable memory, soul/identity system, and shared HTTP tool API.

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
- [ ] 05-01-PLAN.md — WorkspaceManager + WorkspaceGit foundation (SOUL.md loading, workspace init, git audit trail)
- [ ] 05-02-PLAN.md — v1.0 data migration + agent integration (wire SOUL.md into system prompt, CLI startup)

#### Phase 6: Memory Persistence
**Goal**: File-based memory storage with MEMORY.md and daily logs
**Depends on**: Phase 5
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-08
**Success Criteria** (what must be TRUE):
  1. Agent can write durable facts to MEMORY.md and they persist across restarts
  2. Agent writes daily notes to memory/YYYY-MM-DD.md with today's activities
  3. Agent loads today's and yesterday's daily logs at session start automatically
  4. New memory files (MEMORY.md edits, new daily logs) are indexed for search automatically
**Plans**: TBD

Plans:
- [ ] 06-01: TBD

#### Phase 7: Semantic Memory Search
**Goal**: Hybrid vector + BM25 memory search with graceful degradation
**Depends on**: Phase 6
**Requirements**: MEM-04, MEM-05, MEM-06, MEM-07
**Success Criteria** (what must be TRUE):
  1. Agent has memory_search tool that returns relevant snippets from MEMORY.md and daily logs by semantic query
  2. Agent has memory_get tool that reads specific memory files by path with optional line range
  3. Memory search uses hybrid vector + BM25 retrieval with configurable weights (default 70/30)
  4. Memory search gracefully degrades to BM25-only if embedding provider unavailable (network down, quota exceeded)
  5. Memory search handles contradictions with recency weighting (newer facts score higher than old ones)
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD

#### Phase 8: Tool Registry & HTTP API
**Goal**: Canonical tool registry with HTTP invoke endpoint for multi-surface access
**Depends on**: Phase 5
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, API-01, API-02, API-03, API-04, API-05
**Success Criteria** (what must be TRUE):
  1. All tools defined in single canonical registry (one source of truth for schemas and execution)
  2. Canonical registry auto-generates MCP bridge definitions for text agent and llm.tool() definitions for voice agent
  3. Adding new tool requires editing one place; all surfaces (Telegram, LiveKit, iOS) pick it up automatically
  4. HTTP endpoint POST /tools/invoke accepts tool name + arguments with bearer token auth and returns result
  5. HTTP endpoint GET /tools lists available tools with schemas
  6. jarvis-ios can call tools directly via HTTP API instead of only through voice agent
  7. Tool execution handles concurrent requests safely (atomic file writes, no OAuth refresh races)
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD
- [ ] 08-03: TBD

#### Phase 9: Tool Policies
**Goal**: Mode-based tool policies enforced across all surfaces
**Depends on**: Phase 8
**Requirements**: POL-01, POL-02, POL-03
**Success Criteria** (what must be TRUE):
  1. Tools can be enabled/disabled per mode (personal vs work) via configuration
  2. Tool policy configuration stored alongside mode configs in workspace
  3. HTTP API respects tool policies; denied tools return 403 with clear error message
**Plans**: TBD

Plans:
- [ ] 09-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 5 → 6 → 7 → 8 → 9

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Pi-AI Integration | v1.0 | 3/3 | Complete | 2026-02-06 |
| 2. Agent Core & Extensions | v1.0 | 3/3 | Complete | 2026-02-06 |
| 3. Preferences & Configuration | v1.0 | 3/3 | Complete | 2026-02-06 |
| 4. Cron Execution | v1.0 | 2/2 | Complete | 2026-02-06 |
| 5. Workspace & Identity Foundation | v2.0 | 0/TBD | Not started | - |
| 6. Memory Persistence | v2.0 | 0/TBD | Not started | - |
| 7. Semantic Memory Search | v2.0 | 0/TBD | Not started | - |
| 8. Tool Registry & HTTP API | v2.0 | 0/TBD | Not started | - |
| 9. Tool Policies | v2.0 | 0/TBD | Not started | - |
