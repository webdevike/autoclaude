---
phase: 03-intelligence
plan: 01
subsystem: intelligence
tags: [typebox, preferences, user-personalization, validation, atomic-writes]

# Dependency graph
requires:
  - phase: 02-integrations
    provides: TypeBox for tool parameter schemas, extension pattern for tool registration
  - phase: 01-foundation
    provides: SessionManager pattern for JSONL persistence
provides:
  - PreferencesManager with TypeBox schema validation
  - get_preference and set_preference tools with confirmation flow
  - User preference injection into system prompts
  - Persistent storage at ~/.jarvis/users/{userId}/preferences.json
affects: [03-intelligence, future personalization features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - PreferencesManager with lazy initialization pattern (similar to SessionManager)
    - Confirmation flow for set_preference tool (security best practice)
    - Atomic file writes via temp file + fs.renameSync

key-files:
  created:
    - packages/core/src/preferences.ts
    - packages/core/src/tools/config-tools.ts
  modified:
    - packages/core/src/agent.ts
    - packages/core/src/index.ts

key-decisions:
  - "TypeBox schema validation with additionalProperties: false to reject unknown keys"
  - "Atomic writes via temp file + fs.renameSync for POSIX atomicity"
  - "Confirmation flow for set_preference (confirmed=false prompts user, confirmed=true saves)"
  - "Dangerous pattern validation (shell commands, template literals, non-https URLs) in set_preference"
  - "Preferences injected into system prompt (tone, verbosity, behavioral rules)"

patterns-established:
  - "Preference value safety validation: validatePreferenceValue() rejects dangerous patterns"
  - "Config tools follow same pattern as core tools (TypeBox params, AgentToolResult return type)"
  - "Lazy initialization for per-user managers (getPreferencesManager pattern)"

# Metrics
duration: 4min
completed: 2026-02-06
---

# Phase 03 Plan 01: Persistent User Preferences Summary

**PreferencesManager with TypeBox validation, atomic writes, and get/set tools with confirmation flow for agent personalization**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-06T19:47:20Z
- **Completed:** 2026-02-06T19:50:58Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- PreferencesManager class with TypeBox schema validation and atomic file writes
- get_preference and set_preference tools available in smart agent sessions
- User preferences automatically injected into system prompts (tone, verbosity, behavioral rules)
- Persistent storage at ~/.jarvis/users/{userId}/preferences.json with schema enforcement

## Task Commits

Each task was committed atomically:

1. **Task 1: Create PreferencesManager with TypeBox validation** - `098d40f` (feat)
2. **Task 2: Create config tools for preference access** - `693eea4` (feat)
3. **Task 3: Integrate preferences into AgentOrchestrator** - `4f2f3d0` (feat)

## Files Created/Modified

- `packages/core/src/preferences.ts` - PreferencesManager class with schema validation, atomic writes, size warnings
- `packages/core/src/tools/config-tools.ts` - get_preference and set_preference tools with confirmation flow and safety validation
- `packages/core/src/agent.ts` - Integration into AgentOrchestrator (lazy init, system prompt injection, tool registration)
- `packages/core/src/index.ts` - Export PreferencesManager, UserPreferencesSchema, UserPreferences

## Decisions Made

1. **TypeBox schema with additionalProperties: false** - Reject unknown keys to prevent pollution of preferences file
2. **Atomic writes via temp file + fs.renameSync** - POSIX atomic operation prevents file corruption on crashes
3. **Confirmation flow for set_preference** - confirmed=false returns prompt, confirmed=true saves (prevents accidental preference changes)
4. **Dangerous pattern validation** - validatePreferenceValue() rejects shell commands, template literals, script injection, non-https URLs
5. **System prompt injection** - Preferences (tone, verbosity, behavioral rules) added to system prompt in runSmartAgent()
6. **Size warning at 100KB** - Log warning if preferences file exceeds threshold (early detection of bloat)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Preferences foundation complete, ready for learning and memory capabilities (Phase 3 Plan 2)
- User preferences can now be queried and modified by the agent with confirmation
- System prompt includes user preferences, enabling personalized responses

---
*Phase: 03-intelligence*
*Completed: 2026-02-06*
