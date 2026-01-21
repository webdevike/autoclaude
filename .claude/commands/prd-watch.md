Watch PRD execution progress in real-time.

## Instructions

1. If no PRD name in $ARGUMENTS, ask for one

2. Run a watch loop showing progress:
   ```bash
   echo "Watching PRD: <prd-name>"
   echo "Press Ctrl+C to stop"
   echo ""

   while true; do
     clear
     echo "=== PRD Status: <prd-name> ==="
     echo "$(date)"
     echo ""

     # Count by status
     echo "Tasks:"
     grep "status:" .claude/prds/<prd-name>/tasks.yaml | sort | uniq -c
     echo ""

     # Show in-progress tasks
     echo "Currently working on:"
     grep -B1 "status: in-progress" .claude/prds/<prd-name>/tasks.yaml | grep "name:" || echo "  (none)"
     echo ""

     # Show recently modified files
     echo "Recent file changes:"
     find . -type f -name "*.ts" -o -name "*.tsx" -mmin -5 2>/dev/null | grep -v node_modules | head -10

     sleep 10
   done
   ```

3. Or use the simpler one-shot version:
   ```bash
   .claude/skills/PRD/scripts/task-status.sh <prd-name>
   ```

## Arguments
$ARGUMENTS - PRD name to watch
