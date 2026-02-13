# Jarvis

## What This Is

A self-hosted personal AI assistant with multiple surfaces — Telegram (text), LiveKit (voice), and an iOS app for real-time interaction. Uses Claude Code as the default agent with integrations for Gmail, Linear, Notion, and Exa. Features persistent memory, a programmable identity (soul.md), and a shared tool registry accessible from any client surface.

## Core Value

A unified AI assistant that remembers context across sessions and surfaces — whether I'm typing on Telegram, talking via the iOS app, or using the CLI — with the same tools and identity everywhere.

## Current Milestone: v2.0 Unify LiveKit Agent Through Gateway

**Goal:** Route iOS text messages through the gateway orchestrator so iOS gets the same tools, SOUL.md, session continuity, and modes as Telegram. Forward voice tool results to iOS as structured JSON for tool cards.

**Target features:**
- Internal HTTP API on gateway process (localhost:3457) exposing orchestrator to LiveKit agent
- LiveKit agent routes iOS text messages through gateway orchestrator (same path as Telegram)
- Voice tool results forwarded to iOS via data channel as structured JSON
- iOS gets SOUL.md personality, session continuity, all orchestrator tools, and mode switching for text path
- Voice path unchanged (OpenAI Realtime with bridged integration tools)

## Current State (v1.0 shipped, cron done)

**Shipped:** 2026-02-06
**Codebase:** ~2,500 lines TypeScript
**Deployed:** VPS srv1312265 via Tailscale

**What works:**
- Claude Code SDK as default agent with streaming
- Gmail, Linear, Notion, Exa as hot-reloadable Extensions
- Cron scheduler with full execution (sends prompts to orchestrator, replies to user)
- Persistent preferences with confirmation flow
- Dynamic mode switching via /mode command
- Self-configuration tools (cron scheduling, config modification, shortcuts)
- LiveKit voice agent (separate process) with tool bridging
- iOS app connects via LiveKit rooms, receives tool results via data channel

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

- [ ] Internal HTTP API exposing orchestrator on localhost:3457
- [ ] LiveKit agent routes iOS text messages through gateway orchestrator
- [ ] Voice tool results forwarded to iOS as structured JSON via data channel
- [ ] Text path provides SOUL.md, session continuity, all tools, and mode switching

### Out of Scope

- Slack integration — no access to work Slack APIs
- Work Gmail — can't configure OAuth on work email, personal Gmail only
- Multi-user support — single user (Ike), single VPS
- Multi-agent routing — single agent for now, multi-agent later
- Web UI — Telegram + iOS app covers interfaces

## Context

**Codebase:** Jarvis monorepo (`@jarvis/*` packages). Deployed on VPS (srv1312265 via Tailscale at 100.111.3.40).

**Agent runtime:** Claude Code SDK as primary agent. Tools exposed via MCP bridge (text) and llm.tool() wrappers (voice). Two systemd services: jarvis.service (gateway + Telegram + scheduler) and jarvis-agent.service (LiveKit voice agent).

**Multi-surface architecture:** Telegram for text, LiveKit for voice, jarvis-ios (Expo/React Native) for mobile. iOS connects via LiveKit rooms and renders tool result cards. Tools currently defined separately per surface — need unification.

**Reference architecture:** OpenClaw (open-source AI assistant) provides the model for workspace structure, soul.md identity, file-based persistent memory with semantic search, and HTTP tool invoke API.

**Daily workflow:** Mix of quick checks ("check email", "what's on Linear") and delegated tasks ("write this code", "draft this email", "do a web search for xyz"). Work mode focuses on Linear + Notion + coding. Personal mode focuses on Gmail + web search + general assistance.

## Constraints

- **Tech stack**: TypeScript, pnpm monorepo
- **Hosting**: Single VPS (srv1312265), Tailscale network
- **LLM providers**: OpenRouter primary, Anthropic/OpenAI as fallbacks
- **Interfaces**: Telegram (text), LiveKit (voice), jarvis-ios (mobile)
- **Runtime**: Node.js 22+
- **Memory storage**: Local filesystem (no external DB for memory — SQLite ok for vector index)
- **Single user**: Ike only, no multi-tenant concerns

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Claude Code SDK as default agent | Powerful tool use, streaming, session resumption | ✓ Good — replaced pi-coding-agent |
| Exa for web search | Already configured on VPS, includes image support | ✓ Good — working Extension |
| Persistent preferences as JSON files | Simple, agent can read/write, no database needed | ✓ Good — atomic writes, TypeBox validation |
| Extension API for integrations | Lifecycle management, hot-reload potential | ✓ Good — clean separation |
| Multiple surfaces (Telegram + LiveKit + iOS) | Access from any device, any modality | ✓ Good — works, needs tool unification |
| Gmail personal only | Can't OAuth work email | — Accepted limitation |
| OpenClaw-style workspace + memory | Proven pattern, file-based, semantic search, identity persistence | ✓ Good — workspace/SOUL.md shipped in Phase 5, memory deferred |
| Internal HTTP API for LK→gateway | Lightweight Hono server, localhost only, reuses orchestrator | — v2.0 |

---
*Last updated: 2026-02-13 after v2.0 scope pivot to LiveKit gateway unification*
