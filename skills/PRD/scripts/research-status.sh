#!/usr/bin/env bash
# Check research completion status

PRD_NAME="${1:-}"

if [[ -z "$PRD_NAME" ]]; then
    echo "Usage: research-status.sh <prd-name>"
    exit 1
fi

RESEARCH_FILE=".claude/prds/$PRD_NAME/research.yaml"

if [[ ! -f "$RESEARCH_FILE" ]]; then
    echo "No research file found for $PRD_NAME"
    echo "(This is OK if no research was needed)"
    exit 0
fi

total=$(grep -c "^- text:" "$RESEARCH_FILE" 2>/dev/null || echo "0")
answered=$(grep -c "^  answer:" "$RESEARCH_FILE" 2>/dev/null || echo "0")
unanswered=$((total - answered))

echo "Research status for $PRD_NAME:"
echo "  Total questions: $total"
echo "  Answered: $answered"
echo "  Unanswered: $unanswered"
echo ""

if [[ $unanswered -gt 0 ]]; then
    echo "Unanswered questions:"
    awk '
    /^- text:/ {
        q = $0
        gsub(/^- text: */, "", q)
        has_answer = 0
    }
    /^  answer:/ { has_answer = 1 }
    /^- text:/ && !has_answer && NR > 1 { print "  - " prev_q }
    { prev_q = q }
    END { if (!has_answer) print "  - " q }
    ' "$RESEARCH_FILE"
fi
