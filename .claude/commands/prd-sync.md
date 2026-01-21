Sync PRD task status with actual implementation state.

Use this when task tracking got out of sync with actual code.

## Instructions

1. Read the PRD and tasks.yaml:
   ```bash
   cat .claude/prds/<prd-name>/PRD.md
   cat .claude/prds/<prd-name>/tasks.yaml
   ```

2. For each task, check if it's actually implemented:
   - Read the spec to understand acceptance criteria
   - Check if the files mentioned in the spec exist
   - Verify the implementation matches the spec

3. Update task status to match reality:
   ```bash
   .claude/skills/PRD/scripts/update-task-status.sh <prd-name> "<task-name>" completed
   ```

4. Report what was synced:
   ```
   Synced task status for: <prd-name>

   Updated:
   - Task A: defined → completed (files exist, implementation matches spec)
   - Task B: defined → completed (verified)

   Still pending:
   - Task C: defined (not yet implemented)
   ```

## Arguments
$ARGUMENTS - PRD name to sync
