---
phase: 07-text-message-routing
plan: 01
subsystem: livekit-agent
tags: [livekit, data-channel, http-api, text-routing, ios-integration]
dependency-graph:
  requires:
    - phase: 06-http-api-foundation
      provides: [http-api-endpoint, gateway-orchestrator]
  provides: [text-message-routing, data-channel-handler, ios-text-integration]
  affects: [07-02, ios-text-interface, tool-execution]
tech-stack:
  added: []
  patterns: [data-channel-messaging, http-api-client, error-handling-with-fallback]
key-files:
  created: []
  modified:
    - packages/livekit-agent/src/agent.ts
decisions:
  - "Native fetch for HTTP client (Node 18+ built-in, no dependencies needed)"
  - "Error responses sent to iOS via data channel (user-facing fallback message)"
  - "Tool names sent separately via function_tools_executed message (matches iOS useToolResults expectations)"
  - "Optional chaining for localParticipant (guards against undefined during publish)"
metrics:
  duration: 59 seconds
  tasks: 1
  files-modified: 1
  completed: 2026-02-13T17:27:26Z
---

# Phase 7 Plan 1: Text Message Routing Summary

**Data channel listener routes iOS text messages through gateway HTTP API, returning orchestrated responses with tool metadata**

## Performance

- **Duration:** 59 seconds
- **Started:** 2026-02-13T17:26:27Z
- **Completed:** 2026-02-13T17:27:26Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- LiveKit agent listens for `user_text` messages on data channel from iOS app
- Text messages forwarded to gateway HTTP API at localhost:3457 using native fetch
- Orchestrated responses (text + tool names) sent back to iOS via data channel
- iOS text messages now use same SOUL.md personality, tools, and modes as Telegram
- Error handling sends fallback error message to iOS if gateway request fails

## Task Commits

Each task was committed atomically:

1. **Task 1: Add data channel text handler with gateway routing** - `37b9b48` (feat)

## Files Created/Modified

- `packages/livekit-agent/src/agent.ts` - Added data channel listener, gateway HTTP client, and response forwarding logic

## What Was Built

### 1. Gateway API Configuration

Added `GATEWAY_API_URL` constant near the top of the file (after env loading):
- Defaults to `http://127.0.0.1:3457`
- Configurable via `GATEWAY_API_URL` environment variable

### 2. Gateway API Client Function

Created `routeTextToGateway()` helper function that:
- POSTs text messages to gateway HTTP API endpoint `/api/message`
- Sends `{ sender, text }` in request body
- Returns `{ text, toolsUsed }` from orchestrator response
- Throws descriptive errors if API request fails
- Uses native `fetch` (Node 18+) - no new dependencies needed

### 3. Data Channel Listener

Added `dataReceived` event handler inside the `entry` function that:

**Message Reception:**
- Listens for data channel messages from remote participants (iOS users)
- Filters for `participant` presence (ignores agent's own messages)
- Decodes Uint8Array payload using TextDecoder
- Parses JSON and filters for `type: "user_text"` messages

**Gateway Routing:**
- Logs incoming text (first 100 chars) with participant identity
- Calls `routeTextToGateway()` to forward to gateway HTTP API
- Receives orchestrated response with text and tool names

**Response Forwarding:**
- Sends `agent_text_response` message via data channel:
  ```json
  {
    "type": "agent_text_response",
    "content": "response text",
    "timestamp": 1234567890
  }
  ```
- Sends `function_tools_executed` message if tools were used:
  ```json
  {
    "type": "function_tools_executed",
    "tools": [{ "name": "tool_name" }]
  }
  ```
- Uses `publishData()` with `reliable: true` for guaranteed delivery
- Uses optional chaining (`localParticipant?.publishData`) to guard against undefined

**Error Handling:**
- Catches all errors during text routing or response forwarding
- Logs detailed error messages to console
- Sends fallback error message to iOS via data channel:
  ```json
  {
    "type": "agent_text_response",
    "content": "Sorry, I encountered an error processing your message. Please try again.",
    "timestamp": 1234567890,
    "error": true
  }
  ```
- Nested try/catch ensures error response failures don't crash the agent

### 4. Registration Confirmation

Added console log confirming data channel text handler registration at startup.

## Code Path Flow

```
iOS App (user types message)
  → Data channel: { type: "user_text", content: "message", timestamp: ... }
  → LiveKit Agent dataReceived event
  → routeTextToGateway("message", "user-id")
  → POST localhost:3457/api/message { sender, text }
  → Gateway HTTP API
    → orchestrator.handleMessage() [same path as Telegram]
    → SOUL.md injection, mode resolution, Claude Code agent
    → Tool execution via extensions
    → onProgress collects tool names
  → Response: { text, toolsUsed }
  → LiveKit Agent
  → Data channel: { type: "agent_text_response", content: "response" }
  → Data channel: { type: "function_tools_executed", tools: [...] }
  → iOS App (displays response + tool cards)
```

## Decisions Made

### Native Fetch for HTTP Client
- **Decision:** Use native `fetch()` instead of axios, node-fetch, or other HTTP client
- **Rationale:** Node 18+ has built-in fetch support, no dependencies needed, simpler dependency tree
- **Impact:** Zero new dependencies added to livekit-agent package

### Error Responses Sent to iOS
- **Decision:** Send user-facing fallback error message via data channel when gateway request fails
- **Rationale:** iOS needs feedback when messages fail (not just silence), better UX than leaving user waiting
- **Implementation:** Fallback message: "Sorry, I encountered an error processing your message. Please try again."
- **Impact:** iOS can show error state in UI instead of infinite loading

### Tool Names Sent Separately
- **Decision:** Send `function_tools_executed` message separately from `agent_text_response`
- **Rationale:** Matches iOS `useToolResults` hook expectations (already implemented in jarvis-ios), allows iOS to render tool cards independently of text
- **Message shape:** `{ type: "function_tools_executed", tools: [{ name }] }` (note: iOS expects `tools[].name` at minimum, optionally `tools[].result`)
- **Impact:** iOS can display tool execution metadata alongside text responses

### Optional Chaining for localParticipant
- **Decision:** Use `ctx.room.localParticipant?.publishData()` instead of `ctx.room.localParticipant.publishData()`
- **Rationale:** Guards against edge cases where localParticipant might be undefined during room lifecycle
- **Impact:** Prevents crashes if publishData called before participant fully initialized

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation completed without issues.

## User Setup Required

None - no external service configuration required. The gateway HTTP API was already set up in Phase 6.

## Next Phase Readiness

**Ready for Phase 7 Plan 2 (07-02-PLAN.md):** iOS text interface implementation

**Integration points:**
- LiveKit agent side complete - ready to receive `user_text` messages and send `agent_text_response` + `function_tools_executed` messages
- Message contracts established and documented:
  - iOS → Agent: `{ type: "user_text", content: string, timestamp: number }`
  - Agent → iOS: `{ type: "agent_text_response", content: string, timestamp: number, error?: boolean }`
  - Agent → iOS: `{ type: "function_tools_executed", tools: [{ name: string }] }`
- HTTP API routing operational (Phase 6)
- SOUL.md personality injection operational (Phase 5)
- iOS can now send text messages and receive orchestrated responses with full tool access

**Verification needed (Phase 7 Plan 2):**
- iOS sends `user_text` message correctly
- iOS receives and renders `agent_text_response` correctly
- iOS receives and renders `function_tools_executed` correctly (tool cards)
- End-to-end flow: iOS text → gateway → tools → iOS response

## Self-Check: PASSED

**Files modified:**
- ✅ FOUND: packages/livekit-agent/src/agent.ts

**Key functionality:**
- ✅ FOUND: dataReceived listener
- ✅ FOUND: routeTextToGateway function
- ✅ FOUND: GATEWAY_API_URL constant
- ✅ FOUND: agent_text_response message
- ✅ FOUND: function_tools_executed message

**Commits:**
- ✅ FOUND: 37b9b48 (task 1 commit)

**Type checking:**
- ✅ PASSED: pnpm type-check (no errors)

---
*Phase: 07-text-message-routing*
*Completed: 2026-02-13*
