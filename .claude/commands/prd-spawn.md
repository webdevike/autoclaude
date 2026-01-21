Spawn autonomous PRD execution in a background tmux session.

## Instructions

1. If no PRD name in $ARGUMENTS, list available PRDs and ask which to execute

2. Verify PRD exists and has defined tasks

3. Create a tmux session for execution:
   ```bash
   # Create session name from PRD
   SESSION_NAME="prd-<prd-name>"

   # Check if session exists
   tmux has-session -t "$SESSION_NAME" 2>/dev/null && echo "Session already exists" && exit 1

   # Create new session running the execute script
   tmux new-session -d -s "$SESSION_NAME" "cd $(pwd) && .claude/skills/PRD/scripts/execute-prd.sh <prd-name>"
   ```

4. Report to user:
   ```
   Spawned autonomous execution in tmux session: prd-<prd-name>

   To monitor:
     tmux attach -t prd-<prd-name>

   To check status:
     /prd-status <prd-name>

   To detach (while attached):
     Ctrl+b then d
   ```

5. Optionally show live status:
   ```bash
   # Show initial task count
   grep -c "status: defined" .claude/prds/<prd-name>/tasks.yaml
   ```

## Arguments
$ARGUMENTS - PRD name to spawn
