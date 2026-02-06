# Jarvis

## What This Is

A self-hosted personal AI assistant accessible via Telegram, built on pi-mono's agent framework. A triage model (cheap/fast) handles quick interactions and delegates complex tasks — coding, research, multi-step workflows — to smarter models. Integrates with Gmail, Linear, Notion, and Exa web search, with a persistent preference system that lets the agent learn and configure itself over time.

## Core Value

A single Telegram interface that intelligently routes between fast responses and deep work, so I never have to context-switch between tools.

## Current State (v1.0 shipped)

**Shipped:** 2026-02-06
**Codebase:** ~2,500 lines TypeScript, pi-mono foundation
**Deployed:** VPS srv1312265 via Tailscale

**What works:**
- Pi-ai unified LLM with 20+ providers, streaming, cost tracking
- Pi-agent-core event-driven loop with TypeBox validation
- Gmail, Linear, Notion, Exa as hot-reloadable Extensions
- Pi-coding-agent delegation in visible tmux sessions
- Persistent preferences with confirmation flow
- Dynamic mode switching via /mode command
- Self-configuration tools (cron scheduling, config modification, shortcuts)

**Known limitations:**
- CronScheduler.executeJob() is a stub — jobs schedule but don't execute prompts

## Requirements

### Validated (v1.0)

- ✓ Pi-ai unified API for all LLM calls (multi-provider, streaming, cost tracking) — v1.0
- ✓ Token-by-token streaming to Telegram with throttled edits — v1.0
- ✓ Pi-agent-core event-driven agent loop with TypeBox validation — v1.0
- ✓ JSONL session persistence surviving restarts — v1.0
- ✓ Context-aware triage routing — v1.0
- ✓ Gmail, Linear, Notion, Exa as Extensions — v1.0
- ✓ Pi-coding-agent delegation in tmux — v1.0
- ✓ Persistent preferences with confirmation flow — v1.0
- ✓ Dynamic mode switching via Telegram — v1.0
- ✓ Self-configuration tools (cron, config, shortcuts) — v1.0

### Active

- [ ] Cron job execution (connect CronScheduler to AgentOrchestrator)
- [ ] Proactive notifications (morning briefing, deadline reminders)

### Out of Scope

- Slack integration — no access to work Slack APIs
- Work Gmail — can't configure OAuth on work email, personal Gmail only
- MCP support — pi-mono philosophy: agent extends itself, no external tool registries
- Mobile app — Telegram is the interface
- Web UI — Telegram is the interface
- Multi-user support — single user (Ike), single VPS

## Context

**Codebase:** Jarvis monorepo (`@jarvis/*` packages) with pi-mono foundation. Deployed on VPS (srv1312265 via Tailscale at 100.111.3.40).

**Pi-mono foundation:** Using `@mariozechner/pi-ai` for LLM abstraction and `@mariozechner/pi-agent-core` for the agent loop. Pi-coding-agent as the smart coding delegate.

**Daily workflow:** Mix of quick checks ("check email", "what's on Linear") and delegated tasks ("write this code", "draft this email", "do a web search for xyz"). Work mode focuses on Linear + Notion + coding. Personal mode focuses on Gmail + web search + general assistance.

## Constraints

- **Tech stack**: TypeScript, pi-mono packages, pnpm monorepo
- **Hosting**: Single VPS (srv1312265), Tailscale network
- **LLM providers**: OpenRouter primary, Anthropic/OpenAI as fallbacks
- **Interface**: Telegram only
- **Runtime**: Node.js 22+, tmux required for process isolation

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use pi-mono (pi-ai + pi-agent-core) instead of custom LLM/agent code | Battle-tested, multi-provider, streaming, token tracking | ✓ Good — eliminates custom code, adds 20+ providers |
| Pi-coding-agent as smart coding delegate | Already proven in OpenClaw, handles coding tasks well with 4 core tools | ✓ Good — visible tmux sessions, full tool access |
| Exa for web search | Already configured on VPS for OpenClaw, includes image support | ✓ Good — working Extension |
| Persistent preferences as JSON files | Simple, agent can read/write, version-controllable, no database needed | ✓ Good — atomic writes, TypeBox validation |
| Confirmation flow for config changes | Prevents accidental agent modifications | ✓ Good — consistent pattern across tools |
| Extension API for integrations | Lifecycle management, hot-reload potential | ✓ Good — clean separation |
| Keep Telegram as sole interface | Minimal surface area, accessible from any device, push notifications built in | ✓ Good — works well |
| Gmail personal only | Can't OAuth work email, personal Gmail already configured with GCP project | — Accepted limitation |

---
*Last updated: 2026-02-06 after v1.0 milestone*
