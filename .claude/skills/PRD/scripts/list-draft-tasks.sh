#!/usr/bin/env bash
# List tasks with status: draft (need specs)

PRD_NAME="${1:-}"

if [[ -z "$PRD_NAME" ]]; then
    echo "Usage: list-draft-tasks.sh <prd-name>"
    exit 1
fi

TASKS_FILE=".claude/prds/$PRD_NAME/tasks.yaml"

if [[ ! -f "$TASKS_FILE" ]]; then
    echo "Tasks file not found: $TASKS_FILE"
    exit 1
fi

echo "Draft tasks for $PRD_NAME (need specs):"
echo ""

awk '
/^- name:/ { task = $0; gsub(/^- name: */, "", task) }
/status: draft/ { print "  - " task }
/^  - name:/ { subtask = $0; gsub(/^  - name: */, "", subtask) }
/^    status: draft/ { print "    - " subtask }
' "$TASKS_FILE"
