#!/usr/bin/env bash
# List all PRDs in the project

PRD_DIR=".claude/prds"

if [[ ! -d "$PRD_DIR" ]]; then
    echo "No PRDs found (directory $PRD_DIR does not exist)"
    exit 0
fi

echo "Available PRDs:"
echo ""

for prd in "$PRD_DIR"/*/; do
    if [[ -f "${prd}PRD.md" ]]; then
        name=$(basename "$prd")

        # Count tasks
        if [[ -f "${prd}tasks.yaml" ]]; then
            total=$(grep -c "^- name:" "${prd}tasks.yaml" 2>/dev/null || echo "0")
            completed=$(grep -c "status: completed" "${prd}tasks.yaml" 2>/dev/null || echo "0")
            echo "  $name ($completed/$total tasks completed)"
        else
            echo "  $name (no tasks defined)"
        fi
    fi
done
