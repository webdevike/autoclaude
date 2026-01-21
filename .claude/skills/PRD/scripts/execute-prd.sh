#!/usr/bin/env bash
# Execute a PRD autonomously with proper task tracking

set -e

PRD_NAME="${1:-}"
MODE="${2:-sequential}"  # sequential or parallel

if [[ -z "$PRD_NAME" ]]; then
    echo "Usage: execute-prd.sh <prd-name> [mode]"
    echo ""
    echo "Modes:"
    echo "  sequential  - Work through tasks one at a time (default)"
    echo "  parallel    - Use workmux for parallel execution"
    echo ""
    echo "Available PRDs:"
    ls -1 .claude/prds/ 2>/dev/null || echo "  (none found)"
    exit 1
fi

PRD_DIR=".claude/prds/$PRD_NAME"

if [[ ! -d "$PRD_DIR" ]]; then
    echo "Error: PRD not found at $PRD_DIR"
    exit 1
fi

if [[ ! -f "$PRD_DIR/tasks.yaml" ]]; then
    echo "Error: No tasks.yaml found. Run planning first."
    exit 1
fi

# Count defined tasks
DEFINED_COUNT=$(grep -c "status: defined" "$PRD_DIR/tasks.yaml" 2>/dev/null || echo "0")
echo "Found $DEFINED_COUNT tasks with status: defined"

if [[ "$DEFINED_COUNT" -eq 0 ]]; then
    echo "No tasks to execute. All tasks may be completed or still in draft."
    exit 0
fi

PROMPT=$(cat <<EOF
You are executing the PRD at .claude/prds/$PRD_NAME/

CRITICAL RULES - YOU MUST FOLLOW THESE:

1. BEFORE implementing any task:
   - Run: .claude/skills/PRD/scripts/update-task-status.sh $PRD_NAME "<task-name>" in-progress

2. AFTER completing any task:
   - Validate: pnpm type-check
   - Run: .claude/skills/PRD/scripts/update-task-status.sh $PRD_NAME "<task-name>" completed

3. IF blocked on any task:
   - Run: .claude/skills/PRD/scripts/update-task-status.sh $PRD_NAME "<task-name>" blocked "reason"
   - Continue to the next task

4. Read the FULL spec file before implementing ANY task

5. Work through tasks in order:
   - Top-level tasks: sequential
   - Subtasks under a parent: can be done together

START NOW:
1. Read $PRD_DIR/tasks.yaml
2. Find the first task with status: defined
3. Read its spec file
4. Implement it
5. Validate and update status
6. Continue until all tasks complete or blocked
EOF
)

if [[ "$MODE" == "parallel" ]]; then
    echo "Parallel mode requires workmux. Starting workmux..."
    # TODO: Integrate with workmux
    echo "Not yet implemented. Use sequential mode for now."
    exit 1
fi

echo ""
echo "Starting autonomous execution..."
echo "PRD: $PRD_NAME"
echo "Mode: $MODE"
echo ""
echo "To monitor progress:"
echo "  .claude/skills/PRD/scripts/task-status.sh $PRD_NAME"
echo ""
echo "---"

# Execute with claude
exec claude -p "$PROMPT" --allowedTools "Read,Write,Edit,Bash,Glob,Grep"
