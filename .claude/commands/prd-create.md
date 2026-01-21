Create a new PRD (Product Requirements Document).

## Instructions

1. Ask the user what they want to build if not specified in $ARGUMENTS
2. Gather requirements through conversation:
   - What problem does it solve?
   - Who is it for?
   - What are the constraints?
3. Research best practices using Exa web search
4. Create the PRD structure:

```bash
mkdir -p .claude/prds/<prd-name>/specs
```

5. Write `.claude/prds/<prd-name>/PRD.md` with:
   - Objective
   - Clarifying Questions (Q&A from conversation)
   - Motivation
   - Research Findings (from Exa)
   - Implementation Details (leave Architecture blank)
   - Constraints
   - Discussion

6. Create empty tasks.yaml:
```yaml
# Tasks will be generated during planning phase
[]
```

7. Report what was created and suggest: "Run `/prd-plan <prd-name>` to generate tasks"

## Arguments
$ARGUMENTS - Optional: name or description of what to build
