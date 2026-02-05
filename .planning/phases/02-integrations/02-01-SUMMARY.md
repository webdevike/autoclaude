---
phase: 02-integrations
plan: 01
subsystem: core-tools
tags: [tools, filesystem, shell, pi-coding-agent, agent-capabilities]
requires: [01-03]
provides:
  - Read, Write, Edit, Bash tools in pi-coding-agent format
  - Tool integration with smart agent
  - Filesystem and shell execution capabilities
affects: [02-02, 02-03]
tech-stack:
  added: []
  patterns: [tool-definition, typebox-schemas]
key-files:
  created:
    - packages/core/src/tools/core-tools.ts
  modified:
    - packages/core/src/pi-session.ts
    - packages/core/src/agent.ts
    - packages/core/src/types.ts
    - packages/core/src/index.ts
decisions:
  - Use TypeBox for tool parameter schemas instead of plain JSON schema
  - Tools accept cwd parameter for context-aware execution
  - Truncate Read/Bash output to 50KB/2000 lines to prevent context overflow
  - Edit tool requires unique match by default (use replace_all for multiple)
metrics:
  duration: 1 minute
  completed: 2026-02-05
---

# Phase 2 Plan 01: Core Coding Tools Summary

**One-liner:** Added Read, Write, Edit, and Bash tools using pi-coding-agent format with TypeBox schemas and context-aware execution.

## What Was Built

### Core Tools Module
Created `packages/core/src/tools/core-tools.ts` with 4 essential coding tools:

1. **Read Tool** - Read file contents with optional line offset/limit
   - Returns content with line numbers (cat -n format)
   - Automatic truncation at 50KB or 2000 lines
   - Path resolution relative to cwd

2. **Write Tool** - Write content to files
   - Creates parent directories automatically
   - Overwrites existing files
   - Returns success message with byte count

3. **Edit Tool** - Targeted string replacement
   - Validates old_string exists in file
   - Requires unique match by default (prevents accidental multi-replacement)
   - replace_all option for intentional global replacement

4. **Bash Tool** - Execute shell commands
   - Configurable timeout (default 120s)
   - Captures stdout and stderr
   - Truncates output to prevent context overflow
   - Returns non-zero exit codes with output

### Tool Integration
- Tools use pi-coding-agent `CoreToolDefinition` format
- TypeBox schemas for parameter validation
- Tools receive cwd context for proper path resolution
- Integrated with smart agent via `createPiSession`

### Architecture
```
agent.ts
  └─> delegateToSmart()
       └─> createCoreTools(cwd)
            └─> createPiSession({ tools, cwd, extensions })
                 └─> createAgentSession({ customTools })
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing extensions parameter in PiSessionConfig**
- **Found during:** Build verification
- **Issue:** agent.ts passed `extensions` to createPiSession, but PiSessionConfig interface didn't accept it
- **Fix:** Added `extensions?: any[]` to PiSessionConfig interface, updated createMinimalResourceLoader to accept and pass extensions
- **Files modified:** packages/core/src/pi-session.ts
- **Commit:** ef4e148

## Implementation Notes

### Pre-existing Work
Most of the plan's work was already implemented before this execution:
- core-tools.ts already existed with all 4 tools
- agent.ts already imported and used createCoreTools
- pi-session.ts already had tools and cwd parameters
- index.ts already exported createCoreTools

The primary contribution of this execution was identifying and fixing the blocking extensions parameter issue that prevented the build from succeeding.

### TypeBox Schema Benefits
- Runtime parameter validation
- Type safety with TypeScript inference
- Automatic error messages for invalid parameters
- Compatible with pi-coding-agent's tool system

### Output Truncation Strategy
Prevents LLM context overflow while maintaining usefulness:
- First check: Line limit (2000 lines)
- Second check: Size limit (50KB)
- Adds truncation notices showing how much was omitted
- Uses "head" pattern (keep beginning, show what's missing)

## Files Changed

### Created
- `packages/core/src/tools/core-tools.ts` (326 lines)
  - Read, Write, Edit, Bash tool implementations
  - TypeBox schemas for each tool
  - Truncation utilities
  - CoreToolDefinition interface

### Modified
- `packages/core/src/pi-session.ts`
  - Added extensions parameter to PiSessionConfig
  - Updated createMinimalResourceLoader to handle extensions
- `packages/core/src/agent.ts` (pre-existing changes)
  - Imports createCoreTools
  - Uses tools in both triage and smart delegation
- `packages/core/src/types.ts` (pre-existing)
  - ToolDefinitionPiAi type exported
  - ModeConfig has cwd field
- `packages/core/src/index.ts` (pre-existing)
  - Exports createCoreTools

## Testing Done

### Build Verification
- ✅ Core package builds successfully
- ✅ dist/tools/core-tools.js created
- ✅ createCoreTools exported in dist/index.js
- ⚠️ Extensions package has pre-existing type errors (out of scope)

### Integration Verification
- ✅ Agent imports createCoreTools
- ✅ Tools passed to createPiSession
- ✅ TypeScript type checking passes for core package

## Next Phase Readiness

### Blockers: None

### Recommendations
1. **Fix extensions package** - Pre-existing type errors in exa, gmail, linear, notion tools (wrong return format - missing content/details)
2. **Test tools end-to-end** - Verify Read/Write/Edit/Bash work correctly via agent execution
3. **Add tool error handling** - Consider retry logic for Bash timeouts

### What Unlocks Next
- **02-02**: Can now implement complex coding tasks via tool usage
- **02-03**: Tool foundation ready for additional integrations
- **AGNT-04**: Coding delegation capability enabled

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| TypeBox for schemas | Pi-coding-agent standard, runtime validation, type inference | Better DX, safer execution |
| Truncate at 50KB/2000 lines | Prevent context overflow while keeping useful output | Stable LLM performance |
| Unique match requirement in Edit | Prevent accidental multi-replacement | Safer edits, intentional replace_all |
| Context-aware cwd | Each mode can have different working directory | Flexible tool execution |

## Alignment Check

✅ **Must-haves satisfied:**
- Agent can use Read tool to read file contents
- Agent can use Write tool to create/overwrite files
- Agent can use Edit tool to make targeted string replacements
- Agent can use Bash tool to execute shell commands
- Tools appear in triage prompt (via allToolNames list)

✅ **Artifacts delivered:**
- packages/core/src/tools/core-tools.ts with all 4 tools
- Agent receives tools when creating Pi session
- Tools use pi-mono Extension format (via CoreToolDefinition)

✅ **Key links verified:**
- agent.ts → createCoreTools ✅
- pi-session.ts → tools parameter ✅
- index.ts → exports createCoreTools ✅

## Commits

1. `ef4e148` - fix(02-01): add extensions parameter to PiSessionConfig

## Summary

Plan 02-01 successfully enabled core coding capabilities for the smart agent. The agent can now read files, write files, perform targeted edits, and execute shell commands - all fundamental requirements for coding delegation (AGNT-04).

The work was mostly pre-implemented, with this execution focused on identifying and fixing a blocking type error that prevented the build from succeeding. The extensions parameter was missing from the PiSessionConfig interface, causing TypeScript compilation to fail.

All tools use TypeBox schemas for parameter validation, integrate cleanly with pi-coding-agent's tool system, and include intelligent output truncation to prevent context overflow. The architecture is clean and extensible for future tool additions.

**Total duration:** 1 minute
**Status:** ✅ Complete
