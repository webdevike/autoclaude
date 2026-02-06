# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-05)

**Core value:** A single Telegram interface that intelligently routes between fast responses and deep work
**Current focus:** Phase 4 - Autonomy

## Current Position

Phase: 4 of 4 (Autonomy) — IN PROGRESS
Plan: 1 of 2 in current phase
Status: Plan 04-01 complete
Last activity: 2026-02-06 — Completed 04-01-PLAN.md (Self-Configuration Tools)

Progress: [█████████▓] 92%

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: 3.5 minutes
- Total execution time: 0.65 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3/3 | 10 min | 3.3 min |
| 02-integrations | 5/5 | 11 min | 2.2 min |
| 03-intelligence | 2/2 | 8 min | 4.0 min |
| 04-autonomy | 1/2 | 10 min | 10.0 min |

**Recent Trend:**
- Last 5 plans: 02-05 (2 min), 03-01 (4 min), 03-02 (4 min), 04-01 (10 min)
- Trend: Phase 4 plan took longer due to new infrastructure (CronScheduler, ConfigManager)

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

**From Plan 02-04:**
- Extension initialization: Call factory functions directly with runtime object (runtime IS the ExtensionAPI)
- Diagnostic logging: Log stderr and diagnostic info instead of silent failures for tmux cleanup
- No async needed: Extension initialization stays synchronous, createAgentSession handles lifecycle events

**From Plan 02-05:**
- DefaultResourceLoader for extensions: Use DefaultResourceLoader with extensionFactories option instead of manual createExtensionRuntime (creates proper Extension objects with tools/handlers Maps)
- session_start event emission: Call session.bindExtensions({}) after session creation to trigger extension lifecycle handlers that initialize API clients

**From Plan 03-01:**
- TypeBox schema with additionalProperties: false: Reject unknown keys to prevent pollution of preferences file
- Atomic writes via temp file + fs.renameSync: POSIX atomic operation prevents file corruption on crashes
- Confirmation flow for set_preference: confirmed=false returns prompt, confirmed=true saves (prevents accidental preference changes)
- Dangerous pattern validation: validatePreferenceValue() rejects shell commands, template literals, script injection, non-https URLs
- System prompt injection: Preferences (tone, verbosity, behavioral rules) added to system prompt in runSmartAgent()
- Size warning at 100KB: Log warning if preferences file exceeds threshold (early detection of bloat)

**From Plan 03-02:**
- Retention policy defaults: 50 max messages, 30 days max age, 10 min messages (prevents unbounded conversation history)
- Mode switch always reloads configs from disk: Enables hot-reload without gateway restart
- Environment variable substitution: ${VAR_NAME} syntax in config files (e.g., cwd field)
- AGENT_CWD environment variable: Set from mode config cwd for working directory context
- Work mode distinctions: Professional tone, linear+gmail integrations, /home/ike/workspace cwd (vs personal's casual tone, notion+gmail)
- Session-locked config: Mode config captured at start of handleMessage(), no mid-session switches

**From Plan 04-01:**
- In-process cron scheduling: Use node-cron instead of external cron (simpler deployment, no system dependencies)
- Confirmation flow for all config changes: Prevents accidental agent modifications, matches config-tools pattern
- Best-effort git commits: Log config changes but don't block operations on git failures
- Whitelist for update_mode_config: Only safe fields modifiable (systemPrompt, tone, integrations, statusInterval, cwd)
- 500-char limit for cron prompts: Prevents injection attacks and unreasonably complex tasks
- Atomic config writes: Temp file + rename prevents corruption on crashes

### Pending Todos

None yet.

### Blockers/Concerns

None currently.

## Session Continuity

Last session: 2026-02-06 20:44 UTC
Stopped at: Completed 04-01-PLAN.md (Self-Configuration Tools)
Resume file: None
