Execute a PRD autonomously with proper task tracking.

## Instructions

1. If no PRD name in $ARGUMENTS, list available PRDs:
   ```bash
   ls .claude/prds/
   ```

2. Verify PRD has defined tasks:
   ```bash
   grep -c "status: defined" .claude/prds/<prd-name>/tasks.yaml
   ```

3. Store current PRD for tracking:
   ```bash
   echo "<prd-name>" > .claude/.current-prd
   ```

4. For EACH task with `status: defined`:

   **a) Mark as in-progress:**
   ```bash
   .claude/skills/PRD/scripts/update-task-status.sh <prd-name> "<task-name>" in-progress
   ```

   **b) Read the spec completely:**
   ```bash
   cat .claude/prds/<prd-name>/specs/<task-name>.md
   ```

   **c) Implement the task** following the spec exactly

   **d) Validate:**
   ```bash
   pnpm type-check 2>&1 || npm run type-check 2>&1 || tsc --noEmit 2>&1 || echo "No type-check configured"
   ```

   **e) For frontend/UI tasks, also validate with Agent Browser:**
   - If the task involves UI components, visual changes, or frontend features
   - Ensure dev server is running (e.g., `pnpm dev`)
   - Use Agent Browser to verify:
     - Components render correctly
     - No console errors
     - Visual acceptance criteria met
   ```bash
   # Example: Check for console errors on a page
   agent-browser --url http://localhost:3000 --check-console
   ```

   **f) Mark as completed (if validation passes):**
   ```bash
   .claude/skills/PRD/scripts/update-task-status.sh <prd-name> "<task-name>" completed
   ```

   **g) Or mark as blocked (if stuck):**
   ```bash
   .claude/skills/PRD/scripts/update-task-status.sh <prd-name> "<task-name>" blocked "reason"
   ```

5. Continue until all tasks are completed or blocked

6. Report final summary:
   - Tasks completed
   - Tasks blocked (with reasons)
   - Files changed

## CRITICAL RULES

- ALWAYS update task status before and after each task
- ALWAYS read the full spec before implementing
- ALWAYS validate before marking complete
- If blocked, document why and continue to next task

## Arguments
$ARGUMENTS - PRD name to execute
