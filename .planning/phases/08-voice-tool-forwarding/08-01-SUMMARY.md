---
phase: 08-voice-tool-forwarding
plan: 01
subsystem: voice-agent
tags: [livekit, openai-realtime, data-channel, tool-forwarding]

# Dependency graph
requires:
  - phase: 07-text-message-routing
    provides: data channel contract for function_tools_executed messages
provides:
  - Voice tool execution events forwarded to iOS via data channel with structured data (name, args, result, isError)
  - Unified function_tools_executed message type for both text and voice paths
affects: [jarvis-ios, tool-cards, voice-interaction]

# Tech tracking
tech-stack:
  added: []
  patterns: [voice.zipFunctionCallsAndOutputs for pairing function calls with outputs]

key-files:
  created: []
  modified: [packages/livekit-agent/src/agent.ts]

key-decisions:
  - "Reuse function_tools_executed message type from text path for consistency"
  - "Include full tool data (arguments + result) in voice messages vs. name-only in text path"
  - "Use AgentSessionEventTypes.FunctionToolsExecuted enum for type-safe event listening"

patterns-established:
  - "Voice tool forwarding: session.on(FunctionToolsExecuted) → zipFunctionCallsAndOutputs → publishData"
  - "Try/catch wrapper on data channel publishes to prevent agent crashes"

# Metrics
duration: 89s
completed: 2026-02-13
---

# Phase 8 Plan 1: Voice Tool Forwarding Summary

**OpenAI Realtime voice tool executions forwarded to iOS via data channel with structured tool data (name, arguments, result, error status)**

## Performance

- **Duration:** 89 seconds (~1.5 min)
- **Started:** 2026-02-13T17:49:29Z
- **Completed:** 2026-02-13T17:50:58Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Voice tool executions during OpenAI Realtime sessions now forwarded to iOS
- Structured tool data includes name, parsed arguments, result string, and error flag
- Reuses same `function_tools_executed` message type as text path (iOS handles both)
- Error-resilient implementation prevents agent crashes on data channel failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Add FunctionToolsExecuted event listener to forward voice tool results via data channel** - `1e458c0` (feat)

## Files Created/Modified
- `packages/livekit-agent/src/agent.ts` - Added AgentSession.on(FunctionToolsExecuted) listener to forward voice tool results

## Decisions Made

**Reuse function_tools_executed message type:**
- Voice path sends full tool data (name, arguments, result, isError)
- Text path sends minimal data (name only)
- iOS can handle both message shapes gracefully

**Use AgentSessionEventTypes enum:**
- Type-safe event listener registration
- Proper TypeScript types for FunctionToolsExecutedEvent

**zipFunctionCallsAndOutputs utility:**
- Pairs function calls with their outputs as tuple arrays
- Handles the common pattern of correlating call/output by index

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**TypeScript compilation errors on first attempt:**
- Initial implementation had incorrect API usage:
  - Used string literal instead of enum
  - Passed two arrays to zipFunctionCallsAndOutputs instead of event object
  - Incorrect destructuring pattern for tuple array
- Fixed by checking LiveKit agents SDK type definitions
- Correct API: `voice.zipFunctionCallsAndOutputs(event)` returns `Array<[FunctionCall, FunctionCallOutput]>`

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 8 complete. Voice tool forwarding fully implemented.

**Ready for iOS integration:**
- iOS can now receive voice tool cards with the same data structure as text tool cards
- iOS useToolResults hook expects `function_tools_executed` messages (now sent for both paths)
- Tool card rendering can show full tool execution details (name, arguments, result)

**Contract established:**
```typescript
{
  type: "function_tools_executed",
  tools: [
    {
      name: string,
      arguments: unknown,  // parsed JSON or raw string
      result: string,
      isError: boolean
    }
  ]
}
```

---
*Phase: 08-voice-tool-forwarding*
*Completed: 2026-02-13*

## Self-Check: PASSED

✅ File exists: packages/livekit-agent/src/agent.ts
✅ Commit exists: 1e458c0 (feat: add voice tool execution forwarding via data channel, 1 file changed, 46 insertions)
