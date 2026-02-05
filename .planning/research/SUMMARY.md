# Project Research Summary

**Project:** Jarvis - Personal AI Assistant
**Domain:** Self-hosted personal AI assistant with two-tier model delegation
**Researched:** 2026-02-05
**Confidence:** HIGH

## Executive Summary

The personal AI assistant domain has converged around **pi-mono architecture** (minimal tools, transparent abstractions) and **two-tier delegation** (cheap triage model + expensive smart model) as the 2026 standard. Research shows that Jarvis should adopt pi-mono packages (@mariozechner/pi-ai for LLM abstraction, @mariozechner/pi-agent-core for agent runtime) while keeping its domain-specific orchestration layer (channels, modes, integrations, scheduling). This migration preserves what works (gateway pattern, triage logic, integrations) while replacing custom implementations with battle-tested libraries.

The recommended approach is **incremental migration over 6 weeks**: Phase 1 replaces the LLM client, Phase 2 swaps the agent loop, Phase 3 standardizes tools, Phase 4 adds persistent preferences, Phase 5 integrates pi-coding-agent, and Phase 6 enables self-configuration. Each phase delivers value independently while moving toward production-ready architecture.

**Key risks:** Context injection without visibility (MCP adds 7-9% overhead), self-modifying config corruption, OAuth token expiration after 6 months, and tmux zombie process accumulation. All are mitigated through pi-mono's minimal philosophy, strict validation, token rotation, and defense-in-depth process cleanup.

## Key Findings

### Recommended Stack

The 2026 standard for self-hosted AI assistants centers on **TypeScript monorepos with pnpm**, **pi-mono packages** for LLM and agent abstractions, **multi-provider LLM access** (OpenRouter as aggregator with direct Anthropic/OpenAI fallbacks), and **lightweight persistence** (JSON files → SQLite migration path). Node.js 22+ provides native TypeScript support, and systemd is the clear choice for VPS deployment over tmux/PM2.

**Core technologies:**
- **pi-ai (0.48.0+)**: Multi-provider LLM abstraction with 20+ providers, cross-provider context handoff, token tracking, tool calling — replaces custom LLMClient
- **pi-agent-core (0.48.0+)**: Event-driven agent loop with tool execution, message queuing, attachment handling — replaces custom AgentOrchestrator internals
- **OpenRouter + direct providers**: Aggregator with 300+ models and Zero Completion Insurance, fallback to direct Anthropic/OpenAI APIs for production
- **Telegram long polling**: Manual fetch-based polling (no grammY dependency) is simpler and works without public URL for single-user bots
- **systemd**: Native service manager for Linux VPS deployments, auto-restart, integrated logging via journalctl
- **JSON → SQLite**: Start with JSON files (current approach is correct), migrate to SQLite when conversation history exceeds ~1000 entries

**Migration effort:** 1-2 weeks part-time, 3-5 days full-time. Risk is LOW — pi-mono is stable (7000+ stars, 141 releases), migration is incremental, existing code remains as fallback.

### Expected Features

**Must have (table stakes):**
- Natural conversation with multi-turn context — already have via LLM + session tracking
- Tool integration (Gmail, Linear, Notion) with reliable execution — have integrations, need retry logic and rate limit handling
- Persistent memory across sessions — missing: sessions lost on restart, no long-term storage
- Fast response times via two-tier triage — already have: Haiku triage → Sonnet/Opus delegation
- Mode/context switching (personal/work/coding) — already have via /mode command
- Status awareness and error graceful degradation — already have via status reporter

**Should have (competitive differentiators):**
- Two-tier triage/delegation — already implemented, reduces costs 80-90%
- Privacy-first self-hosted — already have: runs on VPS, no data sharing
- Autonomous self-configuration — missing: agent can't read/write own config yet
- Coding agent delegation — planned: integrate pi-coding-agent for dev tasks
- Proactive notifications — partial: have cron jobs, need context-aware triggers
- Semantic memory search — missing: would need vector DB, defer until JSON storage insufficient

**Defer (v2+):**
- Agent writes its own tools — very high complexity, security nightmare
- Web UI dashboard — contradicts "Telegram is the interface" philosophy
- Multi-user support — not target use case, adds multi-tenancy complexity
- Voice interface — text-first workflow, no need for 99.5% voice accuracy
- MCP server support — pi-mono philosophy: agent extends itself via code, not external tool registries

### Architecture Approach

Jarvis should be architected as a **channel adapter layer** above pi-mono's agent core, not a replacement for pi-mono. The migration preserves the Gateway → Orchestrator → Triage → Smart Agent flow while delegating the agent loop, LLM calls, and tool execution to pi-mono's proven implementations. The gateway handles domain-specific routing (channels, modes, scheduling), while pi-mono excels at agent runtime and tool execution.

**Major components:**
1. **Gateway (keep, enhance)** — Channel-agnostic message routing, multi-channel support, placeholder/edit pattern for progress updates
2. **Mode Manager (keep, simplify)** — Context switching between personal/work/coding modes with mode-specific configs
3. **Orchestrator (replace core, keep triage)** — Triage decision logic preserved, runSmartAgent() internals replaced with pi-agent-core Agent class
4. **pi-mono Agent (new, core)** — Event-driven agent loop with tool execution, LLM streaming, session persistence via pi-agent-core
5. **Tool Registry (hybrid)** — Keep integration wrappers (Gmail, Notion, Linear), replace built-in tools with pi-mono defaults (Read, Write, Edit, Bash)
6. **Integration Adapters (keep, refactor)** — Convert to pi-mono Extension format for reusability and hot-reloading
7. **Persistent Preferences (new)** — JSON file per user for context, settings, memory

**Key patterns:**
- Channel Adapter: Isolate protocol-specific code (Telegram, Slack, WhatsApp) from business logic
- Triage + Delegation: Cheap model decides handle vs delegate (90% simple requests save costs)
- Event-Driven Progress: Agent emits events for streaming updates to channels
- Tool Registry: Integrations are pluggable, LLM discovers via registry
- Mode as Context: Predefined profiles (personal/work/coding) shape behavior without separate bots

### Critical Pitfalls

1. **Context Injection Without Visibility** — Tools inject 7-9% of context window before work starts (MCP overhead). Prevention: pi-mono's minimal tool philosophy (4 core tools), progressive disclosure, explicit context tracking, trigger summarization at 70-80% capacity.

2. **Self-Modifying Config Without Guardrails** — Agent corrupts JSON config or leaks credentials. Prevention: JSON schema validation, version control for config changes, rollback capability, audit trail, scope limits (no editing of API keys/tokens).

3. **Tmux Zombie Process Accumulation** — Orphaned sub-agents (PPID=1) consume ~200MB each, VPS runs out of memory. Prevention: Defense-in-depth cleanup (kill by process group, kill by TTY, periodic cron job), predictable session naming, monitoring for orphans.

4. **Triage Model Blindly Routing All Complex Tasks** — Over-delegation sends 90%+ to expensive smart tier, costs 10-15x higher. Prevention: Concrete examples in triage prompt, cost monitoring from day one, 50-example test dataset, weekly calibration loop.

5. **OAuth Token Refresh Failures** — Gmail tokens expire after 6 months or Google revokes at 100-token limit. Prevention: Switch to Production mode, automatic token rotation, expiration monitoring at 5 months, graceful degradation with re-auth link.

6. **Memory Poisoning Through Persistent Preferences** — Malicious input writes harmful data to preferences, agent loads and executes. Prevention: JSON schema validation, allowlist approach for preference keys, diff approval before commit, sandboxed preferences, audit logging.

## Implications for Roadmap

Based on research, suggested phase structure (6 weeks part-time or 3-5 days full-time):

### Phase 1: Replace LLM Client (Week 1)
**Rationale:** Foundation for all other changes. No dependencies, pure swap of LLMClient with pi-ai.
**Delivers:** Multi-provider support (20+ providers), cross-provider context handoff, token tracking, cost calculation.
**Addresses:** Table stakes (natural conversation, fast responses), avoids single provider dependency.
**Avoids:** Pitfall #4 (triage routing) by enabling cost tracking from day one.
**Implementation:** Replace LLMClient.chat() with stream() from pi-ai, update provider strings, keep retry/fallback logic.

### Phase 2: Replace Agent Loop (Week 2)
**Rationale:** Core runtime swap enables event-driven progress, session persistence, better error handling.
**Delivers:** Event streaming for progress updates, message queuing, attachment handling, persistent sessions.
**Uses:** pi-agent-core Agent class, builds on Phase 1 (uses pi-ai stream).
**Implements:** Orchestrator component with pi-mono internals.
**Avoids:** Pitfall #1 (context injection) by following pi-mono's minimal abstractions.
**Implementation:** Wrap AgentOrchestrator.runSmartAgent() with Agent.prompt(), subscribe to events (text_delta, toolcall_end), migrate session tracking.

### Phase 3: Standardize Tools (Week 3)
**Rationale:** Consolidate tools into pi-mono Extension format, enable hot-reload and agent self-extension.
**Delivers:** 4 core tools (Read, Write, Edit, Bash) + integration extensions (Gmail, Notion, Linear, Exa).
**Addresses:** Table stakes (tool integration reliability) by using proven tool format.
**Avoids:** Pitfall #7 (MCP over-indexing) by keeping tools minimal and hot-reloadable.
**Implementation:** Replace built-in tools with pi-mono defaults, convert integrations to Extension format with TypeBox schemas.

### Phase 4: Add Persistent Preferences (Week 4)
**Rationale:** Enable long-term memory and context across sessions (missing table stakes feature).
**Delivers:** JSON file per user for preferences, memory, context. Tools: get_preference, set_preference, search_memory.
**Addresses:** Must-have feature (persistent memory), competitive differentiator (autonomous self-config foundation).
**Avoids:** Pitfall #6 (memory poisoning) through JSON schema validation, allowlist, diff approval.
**Implementation:** Create PreferenceStore class, add preference tools, inject into system prompt context, validate before write.

### Phase 5: Integrate pi-coding-agent (Week 5)
**Rationale:** Delegate coding tasks to specialized agent (competitive differentiator).
**Delivers:** RPC integration with pi-coding-agent for complex coding workflows.
**Addresses:** Competitive feature (coding agent delegation, multi-agent orchestration).
**Uses:** pi-coding-agent RPC mode, builds on Phase 2 (agent orchestration stable).
**Implementation:** Add coding task detection to triage logic, route to pi-coding-agent subprocess, format output for channels.

### Phase 6: Add Self-Configuration (Week 6)
**Rationale:** Agent can manage its own settings and schedule (competitive differentiator).
**Delivers:** Tools: update_mode_config, add_cron, remove_cron, switch_mode. Agent modifies own behavior.
**Addresses:** Competitive feature (autonomous self-configuration).
**Avoids:** Pitfall #2 (config corruption) through validation, version control, rollback capability.
**Implementation:** Add config management tools with validation, persist changes to disk, require confirmation for destructive changes.

### Phase Ordering Rationale

- **Foundation first (Phases 1-2):** LLM client and agent loop are infrastructure. Everything depends on these. Must be stable before building features.
- **Tools next (Phase 3):** Standardizing tools enables Phase 4-6. Extensions are the extension point for self-configuration, coding agent, and preferences.
- **Persistence before self-config (Phase 4 before 6):** Preferences inform config decisions. Self-configuration needs preference context to be intelligent.
- **Coding agent after agent loop (Phase 5 after 2):** Requires stable orchestrator for subprocess management and RPC communication.
- **Independent channel/integration work:** Can refactor channels or convert integrations to Extensions during Phase 3 in parallel.

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 2 (Agent Loop):** Event model differs from current callbacks, may need research on event subscription patterns and error handling.
- **Phase 5 (Coding Agent):** RPC integration with pi-coding-agent subprocess, may need research on session management and process lifecycle.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (LLM Client):** Well-documented pi-ai API, mechanical swap, no unknowns.
- **Phase 3 (Tools):** pi-mono Extension format is well-documented, TypeBox schemas are standard.
- **Phase 4 (Preferences):** JSON file storage is straightforward, validation patterns are well-known.
- **Phase 6 (Self-Config):** Config management is standard CRUD + validation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | pi-mono is battle-tested (7000+ stars, 141 releases), active maintenance, designed for agents. Official SDKs for all integrations. |
| Features | HIGH | Based on analysis of OpenClaw (117K+ stars), commercial assistants, and 2026 ecosystem trends. Table stakes and differentiators are clearly defined. |
| Architecture | HIGH | pi-mono architecture is proven, migration path is incremental, component boundaries are clear. Gateway pattern is standard for multi-channel. |
| Pitfalls | HIGH | Verified from official pi-mono sources, production reports, and OpenClaw case studies. Phase warnings are specific and actionable. |

**Overall confidence:** HIGH — This stack and architecture are well-validated by industry practice and multiple authoritative sources.

### Gaps to Address

**Gap: Two-tier triage calibration**
- Research identifies delegation as critical cost factor but doesn't provide specific triage prompt
- Handle during Phase 1: Build 50-example test dataset covering task spectrum, measure delegation accuracy, iterate on triage prompt
- Expected: 2-3 iterations to achieve 30-50% delegation rate

**Gap: pi-coding-agent RPC interface specifics**
- Architecture recommends RPC mode but research doesn't detail the API surface
- Handle during Phase 5: Read pi-coding-agent RPC documentation, test subprocess lifecycle, map extensions to Jarvis integrations
- Fallback: Use TUI mode with input/output capture if RPC proves complex

**Gap: Context window management thresholds**
- Pitfall #1 recommends summarization at 70-80% capacity but doesn't specify how to calculate current usage
- Handle during Phase 2: Implement token tracking per component (system prompt, tools, conversation), expose via status endpoint
- Decision point: When to trigger summarization (preserve N recent messages, summarize older)

**Gap: Preference schema definition**
- Phase 4 requires JSON schema for preferences but research doesn't define structure
- Handle during Phase 4: Design schema with user input (what do they want to remember?), start minimal (name, timezone, notification preferences), expand based on usage
- Validation: Use Ajv or similar for runtime schema validation

## Sources

### Primary (HIGH confidence)

**Pi-Mono Ecosystem:**
- [pi-mono GitHub Repository](https://github.com/badlogic/pi-mono) — Official toolkit, 7000+ stars, 141 releases
- [What I learned building pi-coding-agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) — Mario Zechner's design philosophy
- [@mariozechner/pi-ai npm](https://www.npmjs.com/package/@mariozechner/pi-ai) — LLM abstraction package
- [@mariozechner/pi-agent-core npm](https://www.npmjs.com/package/@mariozechner/pi-agent-core) — Agent runtime package

**Official SDKs:**
- [Linear SDK](https://linear.app/developers/sdk) — Official GraphQL SDK
- [Notion API](https://developers.notion.com/docs/getting-started) — Official JavaScript SDK
- [Gmail API Node.js quickstart](https://developers.google.com/workspace/gmail/api/quickstart/nodejs) — Official Google SDK
- [OpenRouter](https://openrouter.ai/) — LLM aggregator with 300+ models

### Secondary (MEDIUM confidence)

**Architecture & Patterns:**
- [Pi: The Minimal Agent Within OpenClaw](https://lucumr.pocoo.org/2026/1/31/pi/) — Pi-mono design philosophy
- [AI Agent Orchestration Patterns - Azure](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) — Multi-agent patterns
- [Clawdbot: One Brain, Many Channels](https://medium.com/@imranmsa93/how-clawdbot-enables-one-brain-many-channels-ai-agents-across-whatsapp-slack-telegram-and-b49242261419) — Gateway pattern

**Features & Market:**
- [Clawdbot AI: Revolutionary Open-Source Personal Assistant](https://medium.com/@gemQueenx/clawdbot-ai-the-revolutionary-open-source-personal-assistant-transforming-productivity-in-2026-6ec5fdb3084f) — OpenClaw features
- [AI Assistant Market](https://www.marketsandmarkets.com/Market-Reports/ai-assistant-market-40111511.html) — $42B market size
- [16 Best AI Assistant Apps for 2026](https://reclaim.ai/blog/ai-assistant-apps) — Feature expectations

**Pitfalls & Production:**
- [State of AI Agent Engineering](https://www.langchain.com/state-of-agent-engineering) — Industry survey on observability, testing, quality
- [OWASP Agentic Security Top 10](https://medium.com/@oracle_43885/owasps-ai-agent-security-top-10-agent-security-risks-2026-fc5c435e86eb) — Security risks
- [Context Window Overflow in 2026](https://redis.io/blog/context-window-overflow/) — Context management
- [Gastown Orphan Process Cleanup](https://github.com/steveyegge/gastown/issues/29) — Tmux zombie mitigation

### Tertiary (LOW confidence)

**Cost & Deployment:**
- [Complete LLM Pricing Comparison 2026](https://www.cloudidr.com/blog/llm-pricing-comparison-2026) — Pricing estimates
- [How To Deploy Node.js with Systemd and Nginx](https://www.digitalocean.com/community/tutorials/how-to-deploy-node-js-applications-using-systemd-and-nginx) — Deployment patterns
- [Polling vs Webhook in Telegram Bots](https://hostman.com/tutorials/difference-between-polling-and-webhook-in-telegram-bots/) — Channel choices

---
*Research completed: 2026-02-05*
*Ready for roadmap: yes*
