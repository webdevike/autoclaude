---
phase: 04-autonomy
plan: 01
subsystem: agent-autonomy
tags: [cron, self-configuration, autonomy, scheduling, config-management]
requires: [03-02]
provides: [cron-scheduler, config-manager, autonomy-tools]
affects: [04-02]
tech-stack:
  added: [node-cron, cron-parser, simple-git]
  patterns: [confirmation-flow, atomic-writes, git-audit-trail]
key-files:
  created:
    - packages/core/src/cron-scheduler.ts
    - packages/core/src/config-manager.ts
    - packages/core/src/tools/autonomy-tools.ts
  modified:
    - packages/core/src/agent.ts
    - packages/core/src/index.ts
    - packages/core/src/pi-session.ts
    - packages/core/src/tools/core-tools.ts
    - packages/core/src/tools/config-tools.ts
    - packages/core/package.json
decisions:
  - decision: Use node-cron for in-process scheduling instead of external cron
    rationale: Simpler deployment, no system cron dependencies, easier to test
    affects: Deployment - no external cron configuration needed
  - decision: Require confirmation for all config changes
    rationale: Prevents accidental agent modifications, matches config-tools pattern
    affects: User must explicitly approve cron jobs and config updates
  - decision: Best-effort git commits for audit trail
    rationale: Log changes but don't block operations on git failures
    affects: Config history available if git works, operations continue regardless
  - decision: Whitelist allowed config fields for update_mode_config
    rationale: Critical fields (triage, smart, mode, channels) need special handling
    affects: Agent can only modify safe fields (systemPrompt, tone, integrations, statusInterval, cwd)
  - decision: 500-char limit and pattern validation for cron prompts
    rationale: Prevents injection attacks and unreasonably complex automated tasks
    affects: Cron jobs must be concise and cannot contain suspicious patterns
metrics:
  duration: 10 minutes
  completed: 2026-02-06
---

# Phase 04 Plan 01: Self-Configuration Tools Summary

**One-liner:** Agent can schedule cron jobs, modify configs, create shortcuts with confirmation-based self-configuration tools

## What Was Built

Implemented autonomy tools that enable the agent to manage its own scheduling and configuration:

**CronScheduler** (packages/core/src/cron-scheduler.ts):
- In-process scheduling using node-cron
- Validates cron expressions with cron.validate()
- Calculates next run times with cron-parser
- Loads jobs from mode configs on startup
- Map-based job storage for O(1) lookup
- Stub executeJob() for gateway integration later

**ConfigManager** (packages/core/src/config-manager.ts):
- Atomic writes via temp file + fs.renameSync (POSIX atomic operation)
- TypeBox schema validation before persisting
- Automatic rollback on validation failure
- Best-effort git commits for audit trail (logs but doesn't throw)
- Methods: addCronJob(), removeCronJob(), updateModeConfigField(), getConfigHistory()

**6 Autonomy Tools** (packages/core/src/tools/autonomy-tools.ts):
1. **add_cron_job**: Schedule recurring tasks with preview of next 5 runs
2. **list_cron_jobs**: View all scheduled jobs with next run times
3. **remove_cron_job**: Unschedule jobs with confirmation
4. **update_mode_config**: Modify safe config fields (systemPrompt, tone, integrations, statusInterval, cwd)
5. **add_tool_shortcut**: Create shortcuts in user preferences
6. **get_config_history**: View git log of config changes

**Integration** (packages/core/src/agent.ts):
- ConfigManager instance created in constructor
- scheduler.loadFromModeConfigs() called after mode loading
- Autonomy tools registered alongside core/config tools in smart agent
- currentMode passed through PiSessionConfig to tool context

## Validation & Security

**validateCronPrompt()** rejects dangerous patterns:
- Instruction injection: "ignore instructions", "system prompt", "override settings"
- Automated messaging: "send email to", "send message to"
- Non-HTTPS URLs and IP address URLs
- Length > 500 chars

**Confirmation flow** for all mutations:
- First call with confirmed=false returns preview
- User approves with "yes"
- Second call with confirmed=true executes action
- Matches pattern from config-tools.ts (Phase 3)

**Atomic writes** prevent corruption:
- Write to .tmp file
- Validate with TypeBox
- Rename atomically (POSIX operation)
- Rollback backup on failure

## Commits

| Hash    | Message                                                      |
|---------|--------------------------------------------------------------|
| 19766c7 | feat(04-01): create CronScheduler and ConfigManager classes  |
| 0d8b093 | feat(04-01): create autonomy tools with confirmation flow    |
| f988e5c | feat(04-01): integrate autonomy tools into AgentOrchestrator |

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**Ready for 04-02 (Gateway Integration):**
- CronScheduler.executeJob() stub ready for orchestrator reference
- Autonomy tools available in smart agent
- Config changes create git commits for audit

**Blockers:** None

**Open Questions:**
- Should cron execution trigger full handleMessage() or specialized handler?
- Should we add rate limiting for cron job creation?
- Should we support cron job editing (currently must remove + re-add)?

## Testing Notes

**To test manually:**
1. Start gateway with smart agent
2. Ask: "Schedule a cron job named 'morning-briefing' to run '0 9 * * *' with prompt 'Summarize my emails and Linear issues'"
3. Agent should show preview with next 5 runs and ask for confirmation
4. Reply "yes" - job should be added to mode config
5. Check ~/.jarvis/config/personal.json or work.json for cron entry
6. Use list_cron_jobs to verify scheduled
7. Check git log in config dir for audit trail

**Integration verification:**
```bash
# Verify exports
node -e "const core = require('./packages/core/dist/index.js'); console.log(typeof core.scheduler, typeof core.ConfigManager, typeof core.createAutonomyTools);"
# Should print: object function function

# Verify dependencies
grep "node-cron" packages/core/package.json
# Should show version ^3.0.3
```

## Performance Notes

- CronScheduler uses Map for O(1) job lookup
- Config writes are synchronous but atomic
- Git commits are best-effort async (don't block operations)
- No performance concerns - config operations are infrequent

## Documentation Needs

- User guide: How to schedule cron jobs via chat
- Developer guide: How to extend autonomy tools
- Security guide: Pattern validation rules for prompts
