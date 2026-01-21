Plan a PRD by generating tasks and specs.

## Instructions

1. If no PRD name in $ARGUMENTS, list available PRDs:
   ```bash
   ls .claude/prds/
   ```

2. Read the PRD:
   ```bash
   cat .claude/prds/<prd-name>/PRD.md
   ```

3. Explore the codebase to understand:
   - Existing patterns and conventions
   - Files that will need modification
   - Dependencies and integrations

4. Ask clarifying questions if needed (document in PRD Discussion section)

5. Research unknowns using Exa if needed

6. Update PRD with:
   - Architecture section filled in
   - Relevant Guides
   - Relevant Files

7. Generate `tasks.yaml` with structure:
   ```yaml
   - name: Task Name
     description: What this task does
     status: defined
     spec: specs/task-name.md
     subtasks:  # optional
       - name: Subtask Name
         status: defined
         spec: specs/subtask-name.md
   ```

8. Create spec file for each leaf task in `specs/` with:
   - Objective
   - Context (dependencies)
   - Acceptance Criteria
   - Implementation Notes
   - Out of Scope

9. Report summary and suggest: "Run `/prd-execute <prd-name>` to start implementation"

## Arguments
$ARGUMENTS - PRD name to plan
