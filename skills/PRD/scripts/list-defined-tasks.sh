#!/usr/bin/env bash
# List tasks with status: defined (ready to implement)

PRD_NAME="${1:-}"

if [[ -z "$PRD_NAME" ]]; then
    echo "Usage: list-defined-tasks.sh <prd-name>"
    exit 1
fi

TASKS_FILE=".claude/prds/$PRD_NAME/tasks.yaml"

if [[ ! -f "$TASKS_FILE" ]]; then
    echo "Tasks file not found: $TASKS_FILE"
    exit 1
fi

echo "Defined tasks for $PRD_NAME:"
echo ""

# Parse YAML and find defined tasks
awk '
/^- name:/ { task = $0; gsub(/^- name: */, "", task) }
/status: defined/ { print "  - " task }
/^  - name:/ { subtask = $0; gsub(/^  - name: */, "", subtask) }
/^    status: defined/ { print "    - " subtask }
' "$TASKS_FILE"
