---
phase: 06-http-api-foundation
plan: 02
subsystem: cli
tags: [http-api-integration, startup-sequence, livekit-bridge]
dependency-graph:
  requires: [gateway, http-api-module]
  provides: [automated-http-api-startup]
  affects: [livekit-agent]
tech-stack:
  added: []
  patterns: [startup-sequence-integration]
key-files:
  created: []
  modified:
    - packages/cli/src/index.ts
decisions:
  - default-port-host: Use default port (3457) and host (127.0.0.1) from http-api module - no env var configuration needed yet
  - startup-order: HTTP API starts after gateway.start() to ensure channels are ready, before autonomous runner setup
  - same-orchestrator: Pass the same orchestrator instance to HTTP API that's used for Telegram - ensures identical code path
metrics:
  duration: 86 seconds
  tasks: 1
  files-modified: 1
  completed: 2026-02-13T16:51:30Z
---

# Phase 6 Plan 2: CLI Integration Summary

**One-liner:** HTTP API now starts automatically when CLI launches gateway process, wired into startup sequence after channels

## Objective

Wire the HTTP API into the CLI startup sequence so it starts automatically when the gateway process launches, enabling the LiveKit agent to communicate with the orchestrator without manual intervention.

## What Was Built

### 1. Updated CLI Startup Sequence

Modified `packages/cli/src/index.ts` to:
- Import `startHttpApi` from `@jarvis/gateway` (line 19)
- Call `startHttpApi({ orchestrator })` in main() function after `gateway.start()` (line 148)

**Startup order:**
1. Config loading
2. Workspace initialization
3. Orchestrator creation
4. Integrations setup (Linear, Gmail)
5. Gateway creation and mode registration
6. Channel registration (Telegram)
7. Scheduler setup
8. Mode switching to default
9. **Gateway start** (channels become ready)
10. **HTTP API start** ← NEW (this plan)
11. Autonomous runner setup
12. Callback query wiring

### 2. Integration Pattern

The HTTP API receives:
- `orchestrator` - The fully-configured orchestrator instance with:
  - All modes registered (personal, work)
  - All integrations initialized (Linear, Gmail)
  - All tools registered (MCP bridge, scheduler tools)
  - Workspace manager injected (SOUL.md identity)
  - Cron callbacks wired
  - Default mode set

This ensures **identical behavior** whether a message comes from Telegram or the LiveKit agent HTTP endpoint.

## Technical Decisions

### Default Port and Host (No Configuration Yet)
- **Decision:** Use defaults from http-api module (port 3457, host 127.0.0.1) without CLI env var configuration
- **Rationale:** Simple integration first - configuration can be added later if needed
- **Implementation:** Pass only `{ orchestrator }` to startHttpApi, let module use defaults
- **Impact:** Clean integration, no config complexity yet

### Startup Order: After Gateway, Before Runner
- **Decision:** Place startHttpApi call after `gateway.start()` and before autonomous runner setup
- **Rationale:**
  - Gateway must start first so channels are initialized
  - HTTP API doesn't depend on autonomous runner
  - Runner doesn't depend on HTTP API
- **Impact:** Clear dependency chain, no race conditions

### Same Orchestrator Instance
- **Decision:** Pass the same orchestrator instance to HTTP API that handles Telegram messages
- **Rationale:** Ensures identical tool execution, mode handling, workspace access, and session continuity
- **Impact:** No code duplication, unified agent behavior across surfaces

## Code Path Flow

```
CLI main()
  → Load config (personal.json, work.json)
  → Initialize workspace (SOUL.md)
  → Create orchestrator
  → Initialize integrations (Linear, Gmail)
  → Register tools with orchestrator
  → Create gateway
  → Register channels (Telegram)
  → Set up scheduler
  → gateway.start() [channels ready]
  → startHttpApi({ orchestrator }) [HTTP API ready on localhost:3457]
  → Set up autonomous runner
  → Wire callback queries
```

**When LiveKit agent sends message:**
```
iOS app (voice/text)
  → LiveKit room
  → LiveKit agent (packages/livekit-agent)
  → POST localhost:3457/api/message
  → HTTP API handler (packages/gateway/src/http-api.ts)
  → orchestrator.handleMessage()
    → [Same path as Telegram - mode resolution, Claude Code, tools]
  → Response: { text, toolsUsed }
  → LiveKit agent sends to iOS
```

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

**Files modified:**
- ✅ FOUND: packages/cli/src/index.ts modified

**Key functionality:**
- ✅ FOUND: startHttpApi imported from @jarvis/gateway (line 19)
- ✅ FOUND: startHttpApi({ orchestrator }) called (line 148)
- ✅ FOUND: Correct startup order (after gateway.start, before runner setup)

**Commits:**
- ✅ FOUND: 412534e (Task 1 - Wire HTTP API into CLI startup)

**Type checking:**
- ✅ PASSED: pnpm type-check (no errors across all packages)

**No package.json changes:**
- ✅ VERIFIED: @jarvis/gateway already in dependencies from previous work

## Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Wire HTTP API into CLI startup sequence | 412534e | packages/cli/src/index.ts |

## What's Next

**Phase 6 Complete!** HTTP API foundation is fully operational:
- ✅ Plan 1: HTTP API module with Hono server on localhost:3457
- ✅ Plan 2: CLI integration with automatic startup

**LiveKit Agent Integration (Future Work):**
- Update LiveKit agent package to POST messages to localhost:3457/api/message
- Remove direct orchestrator dependency from LiveKit agent
- Document data channel contracts (message types, JSON schemas) for iOS team
- Test end-to-end flow: iOS → LiveKit → HTTP API → Orchestrator → Response

**Phase 7 Preview (Memory Persistence - Future Milestone):**
- MEMORY.md file in workspace
- Semantic search via vector embeddings
- Memory contradiction detection
- Memory update tools for agent

## Usage Example

**Before this plan (manual):**
```typescript
// Had to manually call startHttpApi somewhere
import { startHttpApi } from "@jarvis/gateway";
await startHttpApi({ orchestrator, port: 3457, host: "127.0.0.1" });
```

**After this plan (automatic):**
```bash
# Just run the CLI - HTTP API starts automatically
pnpm start

# Output:
# [startup] Workspace ready at /path/to/workspace
# [gateway] Started with channels: telegram
# [http-api] Listening on http://127.0.0.1:3457  ← Automatic!
# [auto] Telegram callback queries wired to autonomous runner.
#
# Jarvis is running in "personal" mode.
```

**Testing the endpoint:**
```bash
# Health check
curl http://localhost:3457/health
# {"status":"ok"}

# Send message (LiveKit agent will do this)
curl -X POST http://localhost:3457/api/message \
  -H "Content-Type: application/json" \
  -d '{"sender":"livekit-user","text":"Search for latest AI news","mode":"personal"}'

# Response:
# {
#   "text": "Here are the latest AI news articles...",
#   "toolsUsed": ["mcp__jarvis-tools__exa_search"]
# }
```
