Check the status of a PRD's tasks.

## Instructions

1. If no PRD name in $ARGUMENTS, list all PRDs with task counts:
   ```bash
   for prd in .claude/prds/*/; do
     name=$(basename "$prd")
     if [[ -f "$prd/tasks.yaml" ]]; then
       total=$(grep -c "status:" "$prd/tasks.yaml" 2>/dev/null || echo 0)
       completed=$(grep -c "status: complete" "$prd/tasks.yaml" 2>/dev/null || echo 0)
       echo "$name: $completed/$total tasks completed"
     fi
   done
   ```

2. For a specific PRD, show detailed status:
   ```bash
   cat .claude/prds/<prd-name>/tasks.yaml | grep -E "name:|status:|description:"
   ```

3. Format output as a table:

   | Task | Status | Description |
   |------|--------|-------------|
   | ... | ... | ... |

4. Show summary:
   - Total tasks
   - Completed
   - In Progress
   - Blocked (with reasons)
   - Remaining

5. If tasks are blocked, show the blockedReason field

## Arguments
$ARGUMENTS - Optional: PRD name (shows all PRDs if omitted)
