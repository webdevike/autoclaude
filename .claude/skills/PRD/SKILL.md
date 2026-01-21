---
name: PRD
description: Product Requirements Document lifecycle management - create, plan, and implement PRDs
version: 1.0.0
triggers:
  - "prd"
  - "create prd"
  - "plan prd"
  - "work on prd"
  - "implement"
---

# PRD Skill

Comprehensive PRD (Product Requirements Document) management across the complete lifecycle.

## Activation

This skill activates when users:
- Mention PRDs or product requirements
- Want to plan features or projects
- Need to implement planned tasks

## Process Flow

Upon invocation:

1. **Read the PRD specification** from `reference/prd-spec.md`
2. **Gather context** by listing existing PRDs and checking task status
3. **Determine user intent** from trigger words and existing PRD state
4. **Select appropriate workflow** (Create, Plan, or Work)
5. **Execute the workflow** completely
6. **Report results** and suggest next steps

## Workflow Selection

| Trigger Words | Workflow | When to Use |
|---------------|----------|-------------|
| create, new, start, draft | `workflows/CreatePRD.md` | Starting a feature from scratch |
| plan, analyze, research, refine | `workflows/PlanPRD.md` | Existing PRD needs task breakdown |
| work, implement, build, code, develop | `workflows/WorkPRD.md` | Executing defined tasks |
| execute, autonomous, run | `workflows/ExecutePRD.md` | Autonomous execution with tracking |

## Autonomous Execution

For hands-off execution in a tmux session:

```bash
# Start autonomous execution with task tracking
.claude/skills/PRD/scripts/execute-prd.sh <prd-name>

# Monitor progress
.claude/skills/PRD/scripts/task-status.sh <prd-name>
```

This ensures:
- Task status updated to `in-progress` before each task
- Validation runs before marking `completed`
- Blocked tasks documented with reasons

## Decision Logic

```
User mentions PRD
       │
       ▼
┌─────────────────────┐
│ PRD exists?         │
└─────────────────────┘
       │
   No  │  Yes
       │    │
       ▼    ▼
  CreatePRD  ┌─────────────────┐
             │ Tasks defined?  │
             └─────────────────┘
                    │
               No   │  Yes
                    │    │
                    ▼    ▼
               PlanPRD  WorkPRD
```

## Available Scripts

Run via bash to query PRD state:

| Script | Purpose |
|--------|---------|
| `scripts/list-prds.sh` | List all PRDs |
| `scripts/list-defined-tasks.sh` | Show tasks ready to implement |
| `scripts/list-draft-tasks.sh` | Show tasks needing specs |
| `scripts/task-status.sh` | Get status of specific task |
| `scripts/update-task-status.sh` | Update task status |
| `scripts/research-status.sh` | Check research completion |

## Requirements

Before proceeding:
1. **Read the workflow document completely** before execution
2. **Follow each step in order** - don't skip ahead
3. **Report what was accomplished** with suggested next steps

## Reference Materials

- `reference/prd-spec.md` - PRD file format specification
- `reference/task-spec.md` - Task specification template
- `schemas/tasks.schema.json` - Task YAML validation
- `schemas/research.schema.json` - Research YAML validation
