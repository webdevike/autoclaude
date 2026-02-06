---
phase: 02-integrations
plan: 05
subsystem: integrations
tags: [pi-coding-agent, extensions, exa, notion, gmail, linear, DefaultResourceLoader]

# Dependency graph
requires:
  - phase: 02-04
    provides: Extension system architecture and factory pattern
provides:
  - Proper Extension object loading via DefaultResourceLoader.extensionFactories
  - session_start event emission triggering API client initialization
  - Extension tools (exa_search, notion_search, etc.) available in agent runtime
affects: [02-UAT, future extension development]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DefaultResourceLoader for extension loading (replaces manual createExtensionRuntime)"
    - "session.bindExtensions({}) to trigger lifecycle events"

key-files:
  created: []
  modified:
    - packages/core/src/pi-session.ts

key-decisions:
  - "Use DefaultResourceLoader with extensionFactories option instead of manual extension runtime creation"
  - "Call session.bindExtensions({}) after session creation to emit session_start event"

patterns-established:
  - "Extension initialization: DefaultResourceLoader.extensionFactories processes factories into Extension objects with tools/handlers Maps"
  - "Extension lifecycle: bindExtensions({}) triggers session_start event for API client initialization"

# Metrics
duration: 2min
completed: 2026-02-05
---

# Phase 02 Plan 05: Extension Loading Fix Summary

**DefaultResourceLoader with extensionFactories creates proper Extension objects and session_start event initializes API clients**

## Performance

- **Duration:** 2 minutes
- **Started:** 2026-02-06T02:15:19Z
- **Completed:** 2026-02-06T02:17:30Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Extension tools (exa_search, notion_search, gmail_search, linear_search) now available in agent's active tool list
- Extension API clients (Exa, Notion, Gmail, Linear) initialize on session start via session_start event
- Proper Extension objects with tools and handlers Maps created from factory functions

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace createMinimalResourceLoader with DefaultResourceLoader + extensionFactories** - `66ea1aa` (feat)
2. **Task 2: Emit session_start event by calling bindExtensions after session creation** - `7f3d0d7` (feat)

## Files Created/Modified
- `packages/core/src/pi-session.ts` - Replaced manual extension loading with DefaultResourceLoader, added bindExtensions call

## Decisions Made

**Use DefaultResourceLoader with extensionFactories**
- The SDK's DefaultResourceLoader has built-in support for processing extension factories
- Calling `loader.reload()` processes extensionFactories into proper Extension objects (with tools/handlers Maps)
- This eliminates the bug where raw factory functions were returned instead of Extension objects

**Call session.bindExtensions({}) after session creation**
- `createAgentSession` only emits session_start inside `bindExtensions()` or `reload()`
- Without this call, extension session_start handlers never fire
- API clients (Exa, Notion, Gmail, Linear) initialize in their session_start handlers
- Calling with empty bindings `{}` is safe - it only triggers lifecycle events

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## Next Phase Readiness

**Ready for UAT verification:**
- Extension tools should now appear in agent's active tool list
- Exa web search should return real search results (not "no web search capabilities")
- Notion search should return real pages from workspace (not hallucinated results)

**What was fixed:**
1. **Extension objects now created properly** - DefaultResourceLoader processes extensionFactories into Extension objects with tools/handlers Maps (previously raw functions were returned)
2. **session_start event now fires** - bindExtensions({}) triggers the event that initializes API clients (previously event never fired)

**UAT verification commands:**
```bash
# Test Exa web search
# Ask agent: "Search the web for latest AI news"
# Expected: Returns real search results with titles, URLs, snippets

# Test Notion search
# Ask agent: "Search Notion for project documentation"
# Expected: Returns real pages from workspace (requires NOTION_TOKEN set)
```

---
*Phase: 02-integrations*
*Completed: 2026-02-05*
