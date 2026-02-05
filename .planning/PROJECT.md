# Jarvis

## What This Is

A self-hosted personal AI assistant accessible via Telegram, built on top of pi-mono's agent framework. A triage model (cheap/fast) handles quick interactions and delegates complex tasks — coding, research, multi-step workflows — to smarter models. Integrates with Gmail, Linear, Notion, and Exa web search, with a persistent preference system that lets the agent learn and configure itself over time.

## Core Value

A single Telegram interface that intelligently routes between fast responses and deep work, so I never have to context-switch between tools.

## Requirements

### Validated

- ✓ Two-tier LLM delegation (triage → smart) — existing
- ✓ Telegram channel with polling — existing
- ✓ Gmail integration (read/send/manage) — existing
- ✓ Linear integration (issues, projects) — existing
- ✓ Notion integration (search, read, create) — existing
- ✓ Mode system (personal/work configs) — existing
- ✓ Tmux-based process isolation for smart agent sessions — existing
- ✓ Cron-based scheduled tasks — existing
- ✓ Status reporting on running sessions — existing
- ✓ Docker deployment support — existing

### Active

- [ ] Migrate LLM layer to pi-ai (unified multi-provider API, streaming, token tracking)
- [ ] Migrate agent loop to pi-agent-core (event-driven, tool validation, no artificial step limits)
- [ ] Integrate pi-coding-agent as the smart delegate for coding tasks
- [ ] Smarter triage routing (context-aware delegation rules, not just DELEGATE: prefix)
- [ ] On-the-fly mode switching via Telegram (not just env var)
- [ ] Persistent preference system (agent stores and applies user preferences)
- [ ] Self-configuring agent (can read/write its own config files, add tool shortcuts)
- [ ] Exa web search integration
- [ ] Per-mode credentials (different API keys, working directories, tone per mode)
- [ ] Simplified monorepo structure (fewer packages, less abstraction)

### Out of Scope

- Slack integration — no access to work Slack APIs
- Work Gmail — can't configure OAuth on work email, personal Gmail only
- MCP support — pi-mono philosophy: agent extends itself, no external tool registries
- Mobile app — Telegram is the interface
- Web UI — Telegram is the interface
- Multi-user support — single user (Ike), single VPS

## Context

**Existing codebase:** Jarvis monorepo (`@jarvis/*` packages) with working Telegram bot, Gmail/Linear/Notion integrations, two-tier triage/delegate model, tmux sessions, cron scheduler. Already deployed on VPS (srv1312265 via Tailscale at 100.111.3.40).

**OpenClaw experience:** Currently running OpenClaw v2026.1.29 on the same VPS. Works but want full ownership and control — ability to customize deeply without hitting walls. OpenClaw uses pi-mono under the hood; this project adopts the same foundation directly.

**Pi-mono foundation:** Using `@mariozechner/pi-ai` for LLM abstraction (multi-provider, streaming, tool calling with TypeBox schemas, cost tracking) and `@mariozechner/pi-agent-core` for the agent loop (event-driven, tool execution/validation). Pi-coding-agent available as the smart coding delegate.

**Deployment target:** Self-hosted VPS, systemd service, Tailscale network. Same server currently running OpenClaw.

**Daily workflow:** Mix of quick checks ("check email", "what's on Linear") and delegated tasks ("write this code", "draft this email", "do a web search for xyz"). Work mode focuses on Linear + Notion + coding. Personal mode focuses on Gmail + web search + general assistance.

## Constraints

- **Tech stack**: TypeScript, pi-mono packages, pnpm monorepo — same ecosystem as current codebase
- **Hosting**: Single VPS (srv1312265), must coexist with or replace OpenClaw
- **LLM providers**: OpenRouter primary, Anthropic/OpenAI as fallbacks — existing API keys
- **Interface**: Telegram only — all interaction through single bot
- **Runtime**: Node.js 22+, tmux required for process isolation

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use pi-mono (pi-ai + pi-agent-core) instead of custom LLM/agent code | Battle-tested, multi-provider, streaming, token tracking — no point maintaining custom versions | — Pending |
| Pi-coding-agent as smart coding delegate | Already proven in OpenClaw, handles coding tasks well with 4 core tools | — Pending |
| Exa for web search | Already configured on VPS for OpenClaw, includes image support | — Pending |
| Persistent preferences as JSON files | Simple, agent can read/write, version-controllable, no database needed | — Pending |
| Keep Telegram as sole interface | Minimal surface area, accessible from any device, push notifications built in | — Pending |
| Gmail personal only | Can't OAuth work email, personal Gmail already configured with GCP project | — Pending |

---
*Last updated: 2026-02-05 after initialization*
