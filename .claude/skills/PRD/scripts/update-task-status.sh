#!/usr/bin/env bash
# Update the status of a task

PRD_NAME="${1:-}"
TASK_NAME="${2:-}"
NEW_STATUS="${3:-}"
BLOCKED_REASON="${4:-}"

if [[ -z "$PRD_NAME" ]] || [[ -z "$TASK_NAME" ]] || [[ -z "$NEW_STATUS" ]]; then
    echo "Usage: update-task-status.sh <prd-name> <task-name> <status> [blocked-reason]"
    echo ""
    echo "Status options: draft, defined, in-progress, completed, blocked"
    exit 1
fi

# Validate status
case "$NEW_STATUS" in
    draft|defined|in-progress|completed|blocked) ;;
    *)
        echo "Invalid status: $NEW_STATUS"
        echo "Valid options: draft, defined, in-progress, completed, blocked"
        exit 1
        ;;
esac

if [[ "$NEW_STATUS" == "blocked" ]] && [[ -z "$BLOCKED_REASON" ]]; then
    echo "Error: blocked status requires a reason"
    echo "Usage: update-task-status.sh <prd-name> <task-name> blocked \"reason\""
    exit 1
fi

TASKS_FILE=".claude/prds/$PRD_NAME/tasks.yaml"

if [[ ! -f "$TASKS_FILE" ]]; then
    echo "Tasks file not found: $TASKS_FILE"
    exit 1
fi

# Create backup
cp "$TASKS_FILE" "${TASKS_FILE}.bak"

# Update the task status using Python for reliable YAML handling
python3 << EOF
import yaml
import sys

with open("$TASKS_FILE", 'r') as f:
    tasks = yaml.safe_load(f)

def update_task(task_list, name, status, reason=None):
    for task in task_list:
        if task.get('name') == name:
            task['status'] = status
            if status == 'blocked' and reason:
                task['blockedReason'] = reason
            elif 'blockedReason' in task and status != 'blocked':
                del task['blockedReason']
            return True
        if 'subtasks' in task:
            if update_task(task['subtasks'], name, status, reason):
                return True
    return False

reason = """$BLOCKED_REASON""" if "$BLOCKED_REASON" else None
if update_task(tasks, "$TASK_NAME", "$NEW_STATUS", reason):
    with open("$TASKS_FILE", 'w') as f:
        yaml.dump(tasks, f, default_flow_style=False, sort_keys=False)
    print(f"Updated '$TASK_NAME' to status: $NEW_STATUS")
else:
    print(f"Task not found: $TASK_NAME")
    sys.exit(1)
EOF
