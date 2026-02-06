# Requirements: Jarvis

**Defined:** 2026-02-05
**Core Value:** A single Telegram interface that intelligently routes between fast responses and deep work

## v1 Requirements

### LLM Foundation

- [x] **LLM-01**: Agent uses pi-ai unified API for all LLM calls with multi-provider support (OpenRouter, Anthropic, OpenAI)
- [x] **LLM-02**: Responses stream token-by-token to Telegram (edit message as tokens arrive)
- [x] **LLM-03**: Token usage and cost tracked per request, per model tier, with daily/monthly summaries
- [x] **LLM-04**: Triage model uses context-aware routing rules (message content, conversation history, active mode) to decide delegation

### Agent Runtime

- [x] **AGNT-01**: Agent loop powered by pi-agent-core with event-driven execution and no artificial step limits
- [x] **AGNT-02**: Tool calls validated via TypeBox schemas before execution
- [x] **AGNT-03**: Agent sessions persist to disk (JSONL) and survive process restarts
- [x] **AGNT-04**: Coding tasks delegate to pi-coding-agent running in tmux with full tool access

### Communication

- [x] **COMM-01**: Telegram bot accepts messages via long-polling with allowed-user authentication
- [x] **COMM-02**: Long-running responses show streaming updates in Telegram (progressive message edits)
- [x] **COMM-03**: Built-in commands accessible via Telegram (/mode, /sessions, /peek, /preferences)

### Tool Integrations

- [x] **TOOL-01**: Gmail integration reads, sends, and manages email for personal account (OAuth2)
- [x] **TOOL-02**: Linear integration views, creates, and updates issues and projects
- [x] **TOOL-03**: Notion integration searches, reads, and creates pages
- [x] **TOOL-04**: Exa web search returns results with optional image support

### Memory & Configuration

- [x] **MEMR-01**: User preferences stored as JSON file (tone, verbosity, shortcuts, behavioral rules)
- [x] **MEMR-02**: Agent can read and write its own configuration files (mode configs, preferences, tool settings)
- [x] **MEMR-03**: Agent confirms with user before persisting a new preference ("Save this preference?")
- [x] **MEMR-04**: Conversation history persists across restarts with configurable retention

### Modes

- [x] **MODE-01**: Work and personal modes with separate credentials, system prompts, and enabled integrations
- [x] **MODE-02**: User can switch modes on-the-fly via Telegram command without restarting
- [x] **MODE-03**: Each mode has configurable response tone and default working directory

## v2 Requirements

### Extensions

- **EXTN-01**: Hot-reloadable TypeScript extensions for adding new tools without restart
- **EXTN-02**: Cross-provider context handoffs (start conversation on one model, continue on another)

### Scheduling

- **SCHD-01**: Cron-based scheduled tasks with mode-aware execution
- **SCHD-02**: Proactive notifications (morning briefing, deadline reminders)

### Monitoring

- **MNTR-01**: Health check endpoint for systemd watchdog
- **MNTR-02**: Session status broadcasting with progress updates

## Out of Scope

| Feature | Reason |
|---------|--------|
| Slack integration | No access to work Slack APIs |
| Work Gmail | Can't configure OAuth on work email |
| MCP support | Pi-mono philosophy — agent extends itself, no external tool registries |
| Mobile app | Telegram is the interface, accessible from any device |
| Web UI | Telegram is the interface |
| Multi-user support | Single user (Ike), single VPS |
| Voice interface | Text-only via Telegram sufficient |
| Vector DB / RAG | JSON + JSONL handles personal assistant scale, defer if needed |
| Background bash execution | Pi-mono uses visible tmux sessions for observability |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LLM-01 | Phase 1 | Complete |
| LLM-02 | Phase 1 | Complete |
| LLM-03 | Phase 1 | Complete |
| LLM-04 | Phase 1 | Complete |
| AGNT-01 | Phase 1 | Complete |
| AGNT-02 | Phase 1 | Complete |
| AGNT-03 | Phase 1 | Complete |
| AGNT-04 | Phase 2 | Complete |
| COMM-01 | Phase 1 | Complete |
| COMM-02 | Phase 1 | Complete |
| COMM-03 | Phase 1 | Complete |
| TOOL-01 | Phase 2 | Complete |
| TOOL-02 | Phase 2 | Complete |
| TOOL-03 | Phase 2 | Complete |
| TOOL-04 | Phase 2 | Complete |
| MEMR-01 | Phase 3 | Complete |
| MEMR-02 | Phase 3 | Complete |
| MEMR-03 | Phase 3 | Complete |
| MEMR-04 | Phase 3 | Complete |
| MODE-01 | Phase 3 | Complete |
| MODE-02 | Phase 3 | Complete |
| MODE-03 | Phase 3 | Complete |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-05*
*Last updated: 2026-02-06 after Phase 3 completion*
