---
phase: 07-text-message-routing
plan: 02
subsystem: livekit-agent
tags: [livekit, health-check, gateway-availability, resilience, graceful-degradation]
dependency-graph:
  requires:
    - phase: 06-http-api-foundation
      provides: [http-api-health-endpoint, gateway-server]
    - phase: 07-text-message-routing
      plan: 01
      provides: [text-routing-foundation]
  provides: [gateway-health-verification, resilient-text-routing, auto-recovery]
  affects: [text-message-reliability, startup-diagnostics]
tech-stack:
  added: []
  patterns: [health-checks, retry-logic, graceful-degradation, background-startup-tasks]
key-files:
  created: []
  modified:
    - packages/livekit-agent/src/agent.ts
decisions:
  - "Health check uses 3-second timeout to prevent hanging on unreachable gateway"
  - "Prewarm health check loop runs in background (non-blocking) to allow agent to start even if gateway is slow"
  - "Gateway availability flag persists across room sessions (module-scoped)"
  - "Informative error sent to iOS when gateway is unavailable (user feedback)"
  - "Auto-recovery on next message after gateway becomes available (no restart needed)"
metrics:
  duration: 72 seconds
  tasks: 1
  files-modified: 1
  completed: 2026-02-13T17:31:53Z
---

# Phase 7 Plan 2: Gateway Health Verification Summary

**LiveKit agent verifies gateway HTTP API is reachable at startup with periodic retry, logs clear status, and gracefully handles unavailability with auto-recovery**

## Performance

- **Duration:** 72 seconds (1 minute 12 seconds)
- **Started:** 2026-02-13T17:30:41Z
- **Completed:** 2026-02-13T17:31:53Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- LiveKit agent checks gateway health at startup via GET /health endpoint
- Background health check loop in prewarm retries up to 10 times (5s interval)
- Entry function re-checks health and logs gateway availability status
- Data channel handler retries health check if gateway was previously unavailable
- Informative error message sent to iOS when gateway is unreachable
- Auto-recovery when gateway becomes available (no agent restart required)
- Voice functionality completely unaffected by gateway status

## Task Commits

Each task was committed atomically:

1. **Task 1: Add gateway health check with retry logic and startup logging** - `ac159aa` (feat)

## Files Created/Modified

- `packages/livekit-agent/src/agent.ts` - Added health check function, retry logic in prewarm and entry, availability checks in dataReceived handler

## What Was Built

### 1. Gateway Availability Flag

Added module-scoped `gatewayAvailable` flag at the top of the Gateway API client section:
- Initialized to `false`
- Persists across room sessions
- Updated by health checks and message routing results

### 2. Health Check Function

Created `checkGatewayHealth()` helper function that:
- Fetches GET `${GATEWAY_API_URL}/health` endpoint
- Uses `AbortSignal.timeout(3000)` to prevent hanging on unreachable gateway (3-second timeout)
- Parses JSON response and checks for `{ status: "ok" }`
- Returns `true` if healthy, `false` on any error (network, timeout, non-ok status, invalid JSON)
- Catches all errors silently (health checks should never crash the agent)

### 3. Background Health Check in Prewarm

Added background health check loop in `prewarm()` function:
- Runs in an async IIFE (immediately invoked function expression) - non-blocking
- Loops up to 10 times with 5-second intervals (total ~50 seconds)
- Logs "Gateway not ready, retrying in 5s (N/10)..." for each retry
- Breaks early if health check succeeds
- Logs "Gateway health check passed" on success
- Logs warning if gateway still unavailable after all retries: "Gateway not available after retries — will check on first message"
- Agent continues starting even if gateway never becomes available

**Why non-blocking:** Agent and gateway CLI are separate processes. Agent may start before gateway. Voice functionality should work immediately even if text routing isn't ready yet.

### 4. Health Check in Entry Function

Added gateway availability check in `entry()` function (after `ctx.connect()`, before dataReceived listener registration):
- Calls `checkGatewayHealth()` to get current status
- Logs status clearly:
  - Success: "Gateway HTTP API is available — text routing active"
  - Failure: "Gateway HTTP API not reachable — text routing will retry on each message"
- Provides startup diagnostic information for debugging

### 5. Retry Logic in Data Channel Handler

Updated `dataReceived` event handler with health check retry:

**Before routing message:**
- Check `if (!gatewayAvailable)` (gateway was previously unavailable)
- Call `checkGatewayHealth()` to re-check status
- If still unavailable:
  - Send informative error to iOS via data channel:
    ```json
    {
      "type": "agent_text_response",
      "content": "Text processing is temporarily unavailable. Please try again in a moment.",
      "timestamp": 1234567890,
      "error": true
    }
    ```
  - Return early (don't attempt to route message)
- If became available:
  - Log "Gateway HTTP API became available — text routing now active"
  - Continue with message routing

**After successful routing:**
- Set `gatewayAvailable = true` (even if it was already true, ensures flag stays current)

**In error catch block:**
- Set `gatewayAvailable = false` so next message retries health check
- Send generic error message to iOS (same as Plan 1)

### 6. Auto-Recovery Mechanism

The combination of these components creates auto-recovery:

1. **Startup:** Prewarm loop gives gateway up to 50 seconds to start
2. **Entry:** Logs current status for diagnostics
3. **Message handling:** Retries health check if unavailable
4. **Success tracking:** Marks available after successful routing
5. **Failure tracking:** Marks unavailable on error
6. **Next message:** Automatically retries if previously failed

**Result:** No manual intervention or restart required. Gateway can start after agent, stop and restart, etc. — agent adapts automatically.

## Code Path Flows

### Flow 1: Gateway Available at Startup

```
prewarm()
  → Background health check loop starts
  → checkGatewayHealth() → success
  → Log "Gateway health check passed"
  → gatewayAvailable = true

entry()
  → ctx.connect()
  → checkGatewayHealth() → success
  → Log "Gateway HTTP API is available — text routing active"
  → dataReceived listener registered

dataReceived()
  → gatewayAvailable is true → skip health check
  → routeTextToGateway() → success
  → Send response to iOS
```

### Flow 2: Gateway NOT Available at Startup

```
prewarm()
  → Background health check loop starts
  → checkGatewayHealth() → fails (10 times)
  → Log "Gateway not available after retries — will check on first message"
  → gatewayAvailable = false

entry()
  → ctx.connect()
  → checkGatewayHealth() → fails
  → Log "Gateway HTTP API not reachable — text routing will retry on each message"
  → dataReceived listener registered

dataReceived() [first message]
  → gatewayAvailable is false → retry health check
  → checkGatewayHealth() → fails
  → Send unavailable error to iOS
  → Return early

dataReceived() [second message, gateway now running]
  → gatewayAvailable is false → retry health check
  → checkGatewayHealth() → success!
  → Log "Gateway HTTP API became available — text routing now active"
  → routeTextToGateway() → success
  → gatewayAvailable = true
  → Send response to iOS
```

### Flow 3: Gateway Stops After Working

```
dataReceived() [gateway was working]
  → gatewayAvailable is true → skip health check
  → routeTextToGateway() → FAILS (gateway stopped)
  → Catch error
  → gatewayAvailable = false (mark unavailable)
  → Send generic error to iOS

dataReceived() [next message]
  → gatewayAvailable is false → retry health check
  → checkGatewayHealth() → fails (still stopped)
  → Send unavailable error to iOS

dataReceived() [later message, gateway restarted]
  → gatewayAvailable is false → retry health check
  → checkGatewayHealth() → success!
  → Log "Gateway HTTP API became available — text routing now active"
  → routeTextToGateway() → success
  → gatewayAvailable = true
  → Send response to iOS
```

## Decisions Made

### Health Check Timeout (3 seconds)

- **Decision:** Use `AbortSignal.timeout(3000)` for health check fetch requests
- **Rationale:** Gateway should respond to /health endpoint instantly (it's a simple status check). 3 seconds is generous for localhost, prevents hanging indefinitely on unreachable gateway
- **Impact:** Health checks fail fast, don't block agent startup or message handling

### Non-Blocking Prewarm Health Check

- **Decision:** Run health check loop in background async IIFE in prewarm, don't await it
- **Rationale:** Agent and gateway are separate processes, agent shouldn't block startup waiting for gateway (voice functionality works independently of text routing)
- **Implementation:** `(async () => { /* health check loop */ })();` — fire and forget
- **Impact:** Agent starts immediately, voice works immediately, text routing becomes available when gateway is ready

### Module-Scoped Availability Flag

- **Decision:** Define `gatewayAvailable` at module scope (outside defineAgent), not inside entry function
- **Rationale:** Flag should persist across room sessions. If gateway becomes available during one session, subsequent sessions shouldn't re-check unnecessarily
- **Impact:** Health check results cached across agent lifetime, reduces redundant health checks

### Informative Error Messages to iOS

- **Decision:** Send specific "Text processing is temporarily unavailable" message when gateway is unreachable, separate from generic error message
- **Rationale:** User needs to understand why text isn't working (gateway not ready vs. other error). Different messages help debugging and set expectations
- **Impact:** Better UX, users know to wait and retry vs. reporting a bug

### Auto-Recovery on Next Message

- **Decision:** Retry health check on every message if gateway was previously unavailable, rather than fixed interval background polling
- **Rationale:** Message-driven retry is simpler, zero overhead when not needed, recovers immediately when user tries again
- **Alternative considered:** Background polling every N seconds (rejected: adds complexity, ongoing resource usage)
- **Impact:** Gateway recovery happens naturally when user sends next message, no wasted resources on background polling

### Mark Available After Successful Routing

- **Decision:** Set `gatewayAvailable = true` after successful `routeTextToGateway()` call, even if already true
- **Rationale:** Ensures flag stays accurate even if health check passed but first routing failed (edge case), idempotent operation (safe to repeat)
- **Impact:** Availability flag always reflects actual routing success, not just health check success

### Mark Unavailable on Routing Error

- **Decision:** Set `gatewayAvailable = false` in catch block when routing fails
- **Rationale:** If routing fails, gateway might have stopped, crashed, or become unreachable. Next message should retry health check before attempting routing
- **Impact:** Agent automatically adapts to gateway failures without manual restart

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation completed without issues.

## User Setup Required

None - no external service configuration required. The gateway /health endpoint was already implemented in Phase 6.

## Next Phase Readiness

**Phase 7 Complete:** Both plans finished
- ✅ Plan 1 (07-01): Text routing via data channel and gateway HTTP API
- ✅ Plan 2 (07-02): Gateway health verification and resilient connectivity

**Ready for Phase 8:** Next phase in roadmap (if defined)

**Text routing is production-ready:**
- iOS can send text messages via data channel
- LiveKit agent routes text to gateway HTTP API
- Gateway orchestrates responses with full tool access and SOUL.md personality
- Agent verifies gateway health at startup and handles unavailability gracefully
- Auto-recovery when gateway starts or restarts
- Voice functionality completely independent (works even if gateway is down)

**Verification completed (via type-check):**
- ✅ TypeScript compiles without errors
- ✅ `checkGatewayHealth` function present with timeout
- ✅ `gatewayAvailable` flag tracked throughout code
- ✅ `/health` endpoint checked
- ✅ `AbortSignal.timeout` used for request timeout
- ✅ Health check retry loop in prewarm
- ✅ Gateway availability check in entry
- ✅ Retry logic in dataReceived handler

## Self-Check: PASSED

**Files modified:**
- ✅ FOUND: packages/livekit-agent/src/agent.ts

**Key functionality added:**
- ✅ FOUND: checkGatewayHealth function (line 93)
- ✅ FOUND: gatewayAvailable flag (line 91)
- ✅ FOUND: /health endpoint check (line 95)
- ✅ FOUND: AbortSignal.timeout (line 96)
- ✅ FOUND: Health check retry loop in prewarm (line 134)
- ✅ FOUND: Gateway availability check in entry (line 177)
- ✅ FOUND: Retry logic in dataReceived (line 198)
- ✅ FOUND: Mark available on success (line 221)
- ✅ FOUND: Mark unavailable on error (line 252)

**Commits:**
- ✅ FOUND: ac159aa (task 1 commit - verified via git log)

**Type checking:**
- ✅ PASSED: pnpm type-check (no errors)

---
*Phase: 07-text-message-routing*
*Completed: 2026-02-13*
