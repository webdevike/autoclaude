#!/usr/bin/env bash
# Get status of a specific task

PRD_NAME="${1:-}"
TASK_NAME="${2:-}"

if [[ -z "$PRD_NAME" ]] || [[ -z "$TASK_NAME" ]]; then
    echo "Usage: task-status.sh <prd-name> <task-name>"
    exit 1
fi

TASKS_FILE=".claude/prds/$PRD_NAME/tasks.yaml"

if [[ ! -f "$TASKS_FILE" ]]; then
    echo "Tasks file not found: $TASKS_FILE"
    exit 1
fi

# Find the task and print its details
awk -v task="$TASK_NAME" '
BEGIN { found = 0; in_task = 0 }
/^- name:/ {
    current = $0
    gsub(/^- name: */, "", current)
    if (current == task) { found = 1; in_task = 1; print "Task: " current }
}
/^  - name:/ {
    current = $0
    gsub(/^  - name: */, "", current)
    if (current == task) { found = 1; in_task = 1; print "Subtask: " current }
}
in_task && /status:/ { print "Status: " $2 }
in_task && /spec:/ { print "Spec: " $2 }
in_task && /blockedReason:/ {
    reason = $0
    gsub(/^.*blockedReason: */, "", reason)
    print "Blocked: " reason
}
in_task && /^- name:/ && !/task/ { in_task = 0 }
in_task && /^  - name:/ && !/task/ { in_task = 0 }
END { if (!found) print "Task not found: " task }
' "$TASKS_FILE"
