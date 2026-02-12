---
phase: 05-workspace-identity-foundation
plan: 02
subsystem: workspace
tags: [workspace, migration, soul, agent-integration, cli-bootstrap]
dependency_graph:
  requires:
    - 05-01 (WorkspaceManager and WorkspaceGit classes)
  provides:
    - SOUL.md-based agent identity on every message
    - v1.0 data migration to workspace structure
    - Workspace initialization at CLI startup
  affects:
    - packages/core/src/agent.ts (system prompt construction)
    - packages/cli/src/index.ts (bootstrap sequence)
tech_stack:
  added: []
  patterns:
    - Idempotent migration with marker file
    - SOUL.md injection into system prompts (Claude Code + Pi-AI paths)
    - Workspace initialization before agent creation
key_files:
  created: []
  modified:
    - packages/core/src/workspace.ts (added migrateV1Data method)
    - packages/core/src/agent.ts (WorkspaceManager integration)
    - packages/cli/src/index.ts (workspace bootstrap)
decisions:
  - decision: "Migration copies v1.0 data (not moves) to preserve backups"
    rationale: "Safety-first approach - v1.0 files remain untouched as fallback"
  - decision: "Migration runs on every startup (idempotent with marker file)"
    rationale: "Ensures migration happens even if first startup is interrupted"
  - decision: "SOUL.md committed to git on first run via CLI bootstrap"
    rationale: "Establishes baseline for identity changes in audit trail"
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_created: 0
  files_modified: 3
  commits: 2
  completed_date: "2026-02-12"
---

# Phase 05 Plan 02: Workspace Integration & v1.0 Migration Summary

**One-liner:** Wired workspace into agent system prompts and CLI startup, migrating v1.0 sessions/preferences to workspace structure.

## What Was Built

### Task 1: v1.0 Data Migration

Added `migrateV1Data()` method to WorkspaceManager class:

**Migration Paths:**
- `~/.jarvis/sessions/{userId}/messages.jsonl` → `workspace/sessions/{userId}/messages.jsonl`
- `~/.jarvis/users/{userId}/preferences.json` → `workspace/preferences/{userId}.json`

**Key Features:**
1. **Idempotent Operation**: Checks `workspace/.migrated-from-v1` marker file before running
2. **Copy, Not Move**: Preserves v1.0 files as backup - no data loss risk
3. **Non-Fatal**: Wraps entire migration in try/catch, logs warnings on failure
4. **Migration Marker**: Creates marker file with timestamp and counts:
   ```
   Migrated from v1.0 on 2026-02-12T21:55:04Z
   Sessions copied: N
   Preferences copied: M
   ```
5. **Graceful Skipping**: If v1.0 directories don't exist, skips migration steps silently

**Implementation Details:**
- Uses `readdirSync` to enumerate user directories
- Uses `existsSync` checks before every file operation
- Uses `copyFileSync` for data transfer (atomic operation)
- Creates destination directories with `mkdirSync` recursive option
- Logs each successful migration: `[workspace] Migrated session log for {userId}`

### Task 2: Agent & CLI Integration

**Part A: AgentOrchestrator (agent.ts)**

Added WorkspaceManager to agent lifecycle:

1. **Import**: Added `import { WorkspaceManager } from "./workspace.js"`
2. **Field**: `private workspaceManager: WorkspaceManager`
3. **Constructor**: Initializes WorkspaceManager instance
4. **Getter**: `getWorkspaceManager()` for CLI access
5. **Claude Code Path**: Modified `delegateToClaudeCode()`:
   ```typescript
   const systemPrompt = this.workspaceManager.buildSystemPrompt(
     modeConfig.systemPrompt + this.getSkillDocs()
   );
   ```
6. **Pi-AI Path**: Modified `runSmartAgent()`:
   ```typescript
   let smartSystemPrompt = this.workspaceManager.buildSystemPrompt(modeConfig.systemPrompt);
   ```

**Result**: SOUL.md content now prepended to system prompt for every message on both agent paths.

**Part B: CLI Bootstrap (cli/src/index.ts)**

Added workspace initialization sequence before agent creation:

```typescript
// --- Initialize workspace ---
const workspace = new WorkspaceManager();
workspace.ensureWorkspace();

// Initialize git for audit trail
const workspaceGit = new WorkspaceGit(workspace.getWorkspaceDir());
await workspaceGit.initRepo();

// Commit initial SOUL.md if this is first run
await workspaceGit.commitFile("SOUL.md", "Initial SOUL.md from workspace setup");

// Migrate v1.0 data (idempotent, safe to run every startup)
workspace.migrateV1Data();

console.log(`[startup] Workspace ready at ${workspace.getWorkspaceDir()}`);

// --- Initialize core ---
const orchestrator = new AgentOrchestrator(configDir);
```

**Bootstrap Sequence:**
1. Create workspace directories (if first run)
2. Write default SOUL.md (if missing)
3. Initialize git repository (if not exists)
4. Commit SOUL.md to git
5. Run v1.0 migration (idempotent)
6. Log workspace ready message
7. Create AgentOrchestrator instance

**Key Characteristics:**
- Runs on **every startup** (all operations idempotent)
- Git operations are best-effort (never throw)
- Migration is one-time (marker file check)
- No breaking changes to v1.0 behavior (SessionManager and PreferencesManager still read from original paths)

## System Prompt Structure

After this plan, agent system prompts follow this structure:

```
[SOUL.md content from workspace]

---

[Base system prompt from mode config]
[Skill docs from .pi/skills/*/SKILL.md]
[Preferences section (Pi-AI path only)]
[Context summary (Pi-AI path only)]
```

**SOUL.md Limits:**
- Warning at 6000 chars (~1500 tokens)
- Error at 12000 chars (~3000 tokens)

## Deviations from Plan

None - plan executed exactly as written. All tasks completed without modifications.

## Verification Results

All verification checks passed:

1. ✅ `pnpm type-check` passes in packages/core/ (no TypeScript errors)
2. ✅ `pnpm type-check` passes in packages/cli/ (no TypeScript errors)
3. ✅ WorkspaceManager imported and used in agent.ts
4. ✅ `buildSystemPrompt()` called in `delegateToClaudeCode()` (line 714)
5. ✅ `buildSystemPrompt()` called in `runSmartAgent()` (line 623)
6. ✅ CLI imports WorkspaceManager and WorkspaceGit
7. ✅ CLI calls `ensureWorkspace()`, `initRepo()`, `commitFile()`, `migrateV1Data()`

## Next Steps

This plan completes the foundational workspace integration. Future plans will:

1. **Phase 05 Plan 03** (if exists): CLI commands for SOUL.md editing and workspace management
2. **Phase 06**: Switch SessionManager and PreferencesManager to read from workspace paths (breaking change)
3. **Phase 07**: Memory system implementation (MEMORY.md curation, daily logs)
4. **Phase 08**: Semantic memory search with vector embeddings

## Task Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add v1.0 data migration | 825760b | packages/core/src/workspace.ts |
| 2 | Wire workspace into agent and CLI | 1391b1d | packages/core/src/agent.ts, packages/cli/src/index.ts |

## Self-Check: PASSED

### Modified Files Verification

```bash
✅ packages/core/src/workspace.ts modified (migrateV1Data added)
✅ packages/core/src/agent.ts modified (WorkspaceManager integrated)
✅ packages/cli/src/index.ts modified (bootstrap sequence added)
```

### Commits Verification

```bash
✅ 825760b: feat(05-02): add v1.0 data migration to WorkspaceManager
✅ 1391b1d: feat(05-02): wire WorkspaceManager into AgentOrchestrator and CLI startup
```

### Functional Verification

**Migration Logic:**
- ✅ Marker file check prevents re-running migration
- ✅ Copy operations preserve v1.0 data
- ✅ Missing v1.0 directories handled gracefully
- ✅ Migration wrapped in try/catch (non-fatal)

**Agent Integration:**
- ✅ SOUL.md loaded for Claude Code path
- ✅ SOUL.md loaded for Pi-AI smart agent path
- ✅ WorkspaceManager getter available for CLI

**CLI Bootstrap:**
- ✅ Workspace initialization runs before orchestrator creation
- ✅ Git repo initialized and SOUL.md committed
- ✅ Migration runs on every startup (idempotent)

All artifacts verified present and committed.
