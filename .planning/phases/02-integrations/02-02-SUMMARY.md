---
phase: 02-integrations
plan: 02
subsystem: tools
completed: 2026-02-05
duration: 3 min
status: complete

tags:
  - pi-mono
  - extensions
  - gmail
  - linear
  - notion
  - exa
  - web-search

requires:
  - 01-03-PLAN (foundation complete)

provides:
  - Gmail Extension (list, read, send)
  - Linear Extension (search, create, list teams, my issues)
  - Notion Extension (search, read, create pages)
  - Exa Extension (web search with content)

affects:
  - 02-03-PLAN (Status Reporter Extension)
  - 03-XX (Memory system - can reference past emails/issues)

key-files:
  created:
    - packages/extensions/gmail/index.ts
    - packages/extensions/linear/index.ts
    - packages/extensions/notion/index.ts
    - packages/extensions/exa/index.ts
  modified:
    - packages/core/src/agent.ts (import extensions, pass to session)
    - packages/core/src/pi-session.ts (extensions parameter)

tech-stack:
  added:
    - exa-js (web search)
  patterns:
    - Extension API with lifecycle events (session_start/session_shutdown)
    - TypeBox schemas for tool parameters
    - AgentToolResult format (content + details)

decisions:
  - decision: Use pi-coding-agent Extension format for all integrations
    rationale: Enables lifecycle management and hot-reloading potential
    date: 2026-02-05

  - decision: Return AgentToolResult with content array + details object
    rationale: Pi-coding-agent SDK requirement for tool execution results
    date: 2026-02-05

  - decision: Initialize extensions from environment variables
    rationale: Simpler than config files, works well with Telegram/deployment
    date: 2026-02-05
---

# Phase 02 Plan 02: Extension-based Integrations Summary

**One-liner:** Converted Gmail, Linear, Notion to pi-mono Extensions and added Exa web search with TypeBox validation

## Objective Achieved

Converted existing integrations to pi-mono Extension format and added Exa web search. All integrations now use standardized Extension API with lifecycle events (session_start, session_shutdown) and TypeBox schemas for parameter validation.

## Tasks Completed

### Task 1: Extension Structure & Gmail Extension ✓
**Commit:** ffc6461 (fix - corrected return format)

Created Extension package structure with all dependencies. Gmail Extension provides:
- `gmail_list_messages` - List recent messages with query filtering
- `gmail_read_message` - Read full message content by ID
- `gmail_send` - Send emails via Gmail API

Initializes from GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN environment variables.

**Files:**
- `packages/extensions/gmail/index.ts` (243 lines)
- `packages/extensions/package.json` (dependencies: googleapis, exa-js, @linear/sdk, @notionhq/client, typebox, pi-coding-agent)

### Task 2: Exa, Linear, and Notion Extensions ✓
**Commit:** ffc6461 (fix - corrected return format)

Created 3 additional extensions:

**Exa Extension (web search):**
- `exa_search` - Search web with content snippets
- Initializes from EXA_API_KEY
- Supports autoprompt and result count control

**Linear Extension:**
- `linear_search_issues` - Search issues by query
- `linear_create_issue` - Create issues with title/description/priority
- `linear_list_teams` - List all teams
- `linear_my_issues` - List my assigned issues
- Initializes from LINEAR_API_KEY

**Notion Extension:**
- `notion_search` - Search pages and databases
- `notion_read_page` - Read page blocks
- `notion_create_page` - Create pages in databases
- Initializes from NOTION_API_KEY

**Files:**
- `packages/extensions/exa/index.ts` (100 lines)
- `packages/extensions/linear/index.ts` (210 lines)
- `packages/extensions/notion/index.ts` (216 lines)

### Task 3: Register Extensions with Agent ✓
**Commits:** ef4e148 (fix - add extensions parameter), 049537d (complete plan 02-01)

Extensions integrated into agent flow:
- Imported extensions in agent.ts (lines 27-30)
- Created EXTENSIONS array (lines 33-38)
- Passed to createPiSession in runSmartAgent (line 407)
- Added extensions parameter to PiSessionConfig (pi-session.ts line 92)
- Used in resource loader creation (pi-session.ts line 124)

**Note:** This task was completed by parallel agent (02-01) as part of Core Coding Tools plan.

**Files modified:**
- `packages/core/src/agent.ts` (import EXTENSIONS, pass to createPiSession)
- `packages/core/src/pi-session.ts` (extensions parameter in PiSessionConfig)
- `packages/core/package.json` (@jarvis/extensions dependency)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed AgentToolResult return format**
- **Found during:** Task 1 (initial build attempt)
- **Issue:** Extensions returned `{ type: "text", text: "..." }` instead of proper AgentToolResult format
- **Root cause:** Extension code predated pi-agent-core type requirements
- **Fix:** Changed all tool execute methods to return `{ content: [{ type: "text", text: "..." }], details: {} }`
- **Files modified:** All 4 extension files (gmail, linear, notion, exa)
- **Commit:** ffc6461

**2. [Rule 1 - Bug] Fixed Exa import**
- **Found during:** Task 1 (initial build attempt)
- **Issue:** `import Exa from "exa-js"` failed - Exa is a named export, not default
- **Error:** `Cannot use namespace 'Exa' as a type` + `This expression is not constructable`
- **Fix:** Changed to `import { Exa } from "exa-js"`
- **Files modified:** packages/extensions/exa/index.ts
- **Commit:** ffc6461

## Verification

✓ Build passes: `npm run build` succeeds for full monorepo
✓ Extension exports: All 4 extensions have `pi.registerTool` calls
✓ Lifecycle events: All 4 extensions implement `session_start` and `session_shutdown`
✓ TypeBox schemas: All tools use TypeBox for parameter validation
✓ Agent integration: Extensions imported and passed to createPiSession

**Build output:**
```
packages/extensions build: Done
packages/core build: Done
```

**Extension tools registered:**
- Gmail: 3 tools (list, read, send)
- Linear: 4 tools (search, create, list teams, my issues)
- Notion: 3 tools (search, read, create)
- Exa: 1 tool (search)
- **Total: 11 new tools available to smart agent**

## Success Criteria Met

✓ 4 Extension files exist in packages/extensions/
✓ Each Extension uses pi.registerTool with TypeBox schemas
✓ Each Extension handles session_start and session_shutdown
✓ Extensions are loaded by agent during smart delegation
✓ Build passes

## Next Phase Readiness

**Blockers:** None

**Concerns:**
- Extensions require API keys in environment variables - deployment needs docs
- No error recovery if extension initialization fails (logs warning, disables silently)
- Tools return JSON strings - LLM needs to parse, could benefit from structured details

**Opportunities:**
- Hot-reloading potential (Extension API supports it, not implemented yet)
- Tool usage analytics (could track which tools are used most)
- Extension marketplace pattern (easy to add 3rd-party extensions)

## Performance Notes

**Execution time:** 3 minutes (22:23:36 → 22:27:22 UTC)

**Breakdown:**
- Task 1 & 2: Pre-completed (extensions already existed)
- Bug fixes: ~2 minutes (discover + fix return format + Exa import)
- Task 3: Pre-completed by parallel agent
- Verification & documentation: ~1 minute

**Parallelization benefit:** Plan 02-01 and 02-02 executed simultaneously without conflicts. Agent integration (Task 3) completed by 02-01 while 02-02 focused on extension quality fixes.

## Code Quality

**Test coverage:** None yet (extensions not tested)
**Type safety:** Full TypeScript + TypeBox runtime validation
**Error handling:** Try/catch in all tool execute methods, graceful degradation on init failure
**Documentation:** Inline JSDoc comments for each extension and tool

## Dependencies Added

From packages/extensions/package.json:
- `exa-js@^1.0.0` - Web search API client
- `googleapis@^140.0.0` - Gmail API client
- `@linear/sdk@^33.0.0` - Linear API client
- `@notionhq/client@^2.2.15` - Notion API client
- `@sinclair/typebox@^0.34.48` - Schema validation
- `@mariozechner/pi-coding-agent@^0.52.3` - Extension API

From packages/core/package.json:
- `@jarvis/extensions@workspace:*` - Extension package reference

## Related Context

**Environment variables required:**
- `EXA_API_KEY` - Exa web search (get from https://exa.ai/dashboard)
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` - Gmail OAuth2
- `LINEAR_API_KEY` - Linear personal API key
- `NOTION_API_KEY` - Notion integration token

**Tool availability:**
Extensions only loaded when smart agent is invoked (not available to triage model). This is intentional - triage delegates to smart when tools are needed.

**Parallel work:**
Plan 02-01 (Core Coding Tools) completed simultaneously with this plan. Both modified agent.ts and pi-session.ts without conflicts due to surgical edits in different sections.
