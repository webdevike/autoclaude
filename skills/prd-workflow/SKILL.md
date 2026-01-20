---
name: prd-workflow
description: Execute PRD tasks from structured YAML specifications
version: 1.0.0
triggers:
  - "implement task"
  - "work on prd"
  - "execute spec"
---

# PRD Workflow Skill

Execute tasks from Product Requirement Documents using structured YAML files.

## Quick Start

1. **Find the PRD**: Look in `.claude/prds/[name]/`
2. **Read tasks.yaml**: Find tasks with status `defined`
3. **Read the spec**: Load `specs/[task-spec].md`
4. **Implement**: Follow acceptance criteria exactly
5. **Validate**: Run `.claude/scripts/qa-pipeline.sh /path/to/project`
6. **Verify**: Check all criteria and QA results before marking `completed`

## When Stuck

Use this escalation path:
1. **Code Search**: `mcp__exa__get_code_context_exa` with multiple query variations
2. **Deep Research**: `mcp__exa__deep_researcher_start` (use sparingly)
3. **Document Blocker**: Update task status to `blocked` with `blockedReason`

## Detailed Guides

For comprehensive instructions, read:
- `implementation-guide.md` - Full implementation workflow
- `research-guide.md` - How to use exa for research
- `validation-guide.md` - Schema validation details
