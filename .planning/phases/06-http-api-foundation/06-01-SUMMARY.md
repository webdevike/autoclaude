---
phase: 06-http-api-foundation
plan: 01
subsystem: gateway
tags: [http-api, hono, livekit-bridge, internal-api]
dependency-graph:
  requires: [orchestrator, core-types]
  provides: [http-api-endpoint, tool-collection]
  affects: [livekit-agent]
tech-stack:
  added: [hono, @hono/node-server]
  patterns: [request-response-api, event-collection]
key-files:
  created:
    - packages/gateway/src/http-api.ts
  modified:
    - packages/gateway/package.json
    - packages/gateway/src/index.ts
    - pnpm-lock.yaml
decisions:
  - localhost-only-binding: HTTP API bound to 127.0.0.1 only for internal communication between LiveKit agent and gateway
  - no-authentication: No auth layer needed since API is localhost-only and both processes run on same VPS
  - tool-name-collection: Tool names collected via onProgress callback during orchestrator.handleMessage execution
  - hono-framework: Lightweight Hono framework chosen for minimal HTTP server footprint
metrics:
  duration: 132 seconds
  tasks: 2
  files-modified: 4
  completed: 2026-02-13T16:33:32Z
---

# Phase 6 Plan 1: HTTP API Foundation Summary

**One-liner:** Lightweight Hono HTTP API on localhost:3457 for LiveKit agent to communicate with gateway orchestrator

## Objective

Create the HTTP API module in the gateway package that exposes a POST /api/message endpoint for the LiveKit agent to communicate with the gateway orchestrator. This is the internal communication bridge between the LiveKit agent process and the gateway process.

## What Was Built

### 1. HTTP API Module (`packages/gateway/src/http-api.ts`)

Created a new module with:
- `startHttpApi(config: HttpApiConfig)` function - main export for starting the server
- `HttpApiConfig` interface - configuration with orchestrator, port (default 3457), and host (default 127.0.0.1)
- **POST /api/message** endpoint:
  - Accepts JSON body: `{ sender: string, text: string, mode?: string }`
  - Returns JSON response: `{ text: string, toolsUsed: string[] }`
  - Validates required fields (sender, text)
  - Constructs Message object with channel="http-api"
  - Collects tool names via onProgress callback that filters tool_use events
  - Routes through `orchestrator.handleMessage()` - same code path as Telegram
  - Error handling returns 500 with error message
- **GET /health** endpoint - returns `{ status: "ok" }` for service availability checks

### 2. Dependencies Added

- `hono@^4.6.14` - Lightweight web framework
- `@hono/node-server@^1.13.7` - Node.js adapter for Hono

### 3. Gateway Package Exports

Updated `packages/gateway/src/index.ts` to re-export:
- `startHttpApi` function
- `HttpApiConfig` type

This makes the HTTP API available when importing from `@jarvis/gateway`.

## Technical Decisions

### Localhost-Only Binding (127.0.0.1)
- **Decision:** Bind HTTP server to 127.0.0.1 (localhost only), not 0.0.0.0
- **Rationale:** This is internal communication between LiveKit agent and gateway on the same VPS. No external access needed or desired.
- **Impact:** More secure by default - API not exposed to network

### No Authentication
- **Decision:** No auth layer (no API keys, no JWT, no tokens)
- **Rationale:** Both processes run on same VPS, localhost-only binding provides sufficient isolation
- **Impact:** Simpler implementation, no auth overhead
- **Future consideration:** If API later exposed beyond localhost, auth would be required

### Tool Name Collection via onProgress
- **Decision:** Collect tool names by providing onProgress callback that filters for tool_use events
- **Rationale:** Reuses existing orchestrator mechanism, no need to modify core agent code
- **Implementation:** `onProgress` callback checks `event.type === "tool_use" && event.toolName`, pushes to array
- **Impact:** Clean separation of concerns, HTTP API is just a transport layer

### Hono Framework
- **Decision:** Use Hono instead of Express/Fastify
- **Rationale:** Lightweight (~12KB), modern API, excellent TypeScript support, minimal dependencies
- **Impact:** Fast startup, low memory footprint, good for internal API use case

## Code Path Flow

```
LiveKit Agent (iOS message)
  → POST localhost:3457/api/message { sender, text, mode? }
  → http-api.ts handler
  → Construct Message object (channel="http-api")
  → orchestrator.handleMessage(msg, onProgress)
    → [Same path as Telegram - mode resolution, Claude Code delegate, tool execution]
    → onProgress events: tool_use → collect tool names
  → Response: { text, toolsUsed }
  → LiveKit Agent (send to iOS with tool metadata)
```

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

**Files created:**
- ✅ FOUND: packages/gateway/src/http-api.ts

**Key functionality:**
- ✅ FOUND: startHttpApi function
- ✅ FOUND: startHttpApi export in index.ts
- ✅ FOUND: hono dependencies in package.json
- ✅ FOUND: orchestrator.handleMessage call
- ✅ FOUND: tool_use event collection

**Commits:**
- ✅ FOUND: c5693de (task 1 - HTTP API module)
- ✅ FOUND: bf5c728 (task 2 - gateway exports)

**Type checking:**
- ✅ PASSED: pnpm type-check (no errors)

## Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add HTTP API module with Hono server | c5693de | packages/gateway/src/http-api.ts, packages/gateway/package.json, pnpm-lock.yaml |
| 2 | Export startHttpApi from gateway package | bf5c728 | packages/gateway/src/index.ts |

## What's Next

**Phase 6 Plan 2 (06-02-PLAN.md):** CLI integration - update CLI to start HTTP API alongside gateway, wire up LiveKit agent to use the endpoint

**Integration points:**
- CLI needs to call `startHttpApi({ orchestrator, port: 3457, host: "127.0.0.1" })` before starting gateway channels
- LiveKit agent package needs to POST messages to localhost:3457/api/message instead of direct orchestrator calls
- Data channel contracts (message types, JSON schemas) need documentation for iOS team

## Usage Example

```typescript
import { startHttpApi } from "@jarvis/gateway";
import { AgentOrchestrator } from "@jarvis/core";

const orchestrator = new AgentOrchestrator(configDir);

// Start HTTP API (async, non-blocking)
await startHttpApi({
  orchestrator,
  port: 3457,        // optional, defaults to 3457
  host: "127.0.0.1", // optional, defaults to localhost
});

console.log("HTTP API ready for LiveKit agent");
```

**Request example:**
```bash
curl -X POST http://localhost:3457/api/message \
  -H "Content-Type: application/json" \
  -d '{"sender":"livekit-user","text":"What's the weather?"}'
```

**Response example:**
```json
{
  "text": "The weather in San Francisco is currently 65°F and sunny.",
  "toolsUsed": ["mcp__jarvis-tools__exa_search"]
}
```
