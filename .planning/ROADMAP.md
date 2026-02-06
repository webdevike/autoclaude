# Roadmap: Jarvis

## Overview

This roadmap transforms Jarvis from a custom-built Telegram bot into a pi-mono-powered personal AI assistant. The migration preserves what works (gateway pattern, triage logic, integrations) while replacing custom implementations with battle-tested libraries. Four phases deliver the complete vision: Foundation migrates LLM and agent runtime, Integrations standardizes tools and channels, Intelligence adds persistent memory and mode switching, and Autonomy enables self-configuration and coding agent delegation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Migrate to pi-mono (LLM + agent runtime)
- [ ] **Phase 2: Integrations** - Standardize tools and channels
- [ ] **Phase 3: Intelligence** - Add persistent memory and mode switching
- [ ] **Phase 4: Autonomy** - Enable self-configuration and coding delegation

## Phase Details

### Phase 1: Foundation
**Goal**: Agent uses pi-mono for all LLM calls and agent execution with streaming, multi-provider support, and session persistence
**Depends on**: Nothing (first phase)
**Requirements**: LLM-01, LLM-02, LLM-03, LLM-04, AGNT-01, AGNT-02, AGNT-03, COMM-01, COMM-02, COMM-03
**Success Criteria** (what must be TRUE):
  1. Agent can call any of 20+ LLM providers through unified pi-ai API
  2. Responses stream token-by-token to Telegram with progressive message edits
  3. Token usage and cost tracked per request with daily summaries
  4. Agent sessions persist to disk and survive process restarts
  5. Triage model routes messages based on content and conversation history
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md -- Replace LLMClient with pi-ai (install pi-ai, rewrite llm.ts, add streaming to gateway with throttled edits)
- [x] 01-02-PLAN.md -- Replace agent loop with pi-agent-core (rewrite runSmartAgent with Agent class, TypeBox tools, JSONL session persistence, update CLI)
- [x] 01-03-PLAN.md -- Fix empty message guards (gap closure from UAT)

### Phase 2: Integrations
**Goal**: All tools follow pi-mono Extension format and coding tasks delegate to pi-coding-agent
**Depends on**: Phase 1
**Requirements**: AGNT-04, TOOL-01, TOOL-02, TOOL-03, TOOL-04
**Note**: COMM-01, COMM-02, COMM-03 were completed in Phase 1 (Telegram channel, streaming, commands already implemented)
**Success Criteria** (what must be TRUE):
  1. Agent has 4 core tools (Read, Write, Edit, Bash) from pi-mono
  2. Gmail, Linear, Notion, and Exa available as hot-reloadable Extensions
  3. Coding tasks delegate to pi-coding-agent running in tmux
**Plans**: 5 plans

Plans:
- [x] 02-01-PLAN.md -- Add core coding tools (Read, Write, Edit, Bash) with TypeBox schemas
- [x] 02-02-PLAN.md -- Convert Gmail, Linear, Notion to Extensions + add Exa web search
- [x] 02-03-PLAN.md -- Integrate pi-coding-agent for coding task delegation with tmux visibility
- [x] 02-04-PLAN.md -- Gap closure: Initialize extensions + fix tmux cleanup
- [ ] 02-05-PLAN.md -- Gap closure: Fix extension loading (DefaultResourceLoader) + session_start emission

### Phase 3: Intelligence
**Goal**: Agent remembers user preferences and switches modes on-the-fly
**Depends on**: Phase 2
**Requirements**: MEMR-01, MEMR-02, MEMR-03, MEMR-04, MODE-01, MODE-02, MODE-03
**Success Criteria** (what must be TRUE):
  1. User preferences persist to JSON file with schema validation
  2. Agent can read and write its own configuration files
  3. Agent confirms with user before persisting new preferences
  4. Conversation history persists across restarts with retention policy
  5. Work and personal modes have separate credentials and system prompts
  6. User can switch modes via Telegram command without restarting
**Plans**: 2 plans

Plans:
- [ ] 03-01: Add persistent preferences
- [ ] 03-02: Enable dynamic mode switching

### Phase 4: Autonomy
**Goal**: Agent manages its own configuration and schedules, extending itself as needed
**Depends on**: Phase 3
**Requirements**: MEMR-02 (extended)
**Success Criteria** (what must be TRUE):
  1. Agent can add, update, and remove cron jobs via tools
  2. Agent can modify mode configs with validation and rollback
  3. Agent can add tool shortcuts to its own configuration
  4. All config changes require user confirmation before persistence
  5. Config changes tracked in version control with audit trail
**Plans**: 1 plan

Plans:
- [ ] 04-01: Add self-configuration tools

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-02-05 |
| 2. Integrations | 4/5 | Gap closure | - |
| 3. Intelligence | 0/2 | Not started | - |
| 4. Autonomy | 0/1 | Not started | - |
