# ExecutePRD Workflow

Autonomous execution of PRD tasks with proper status tracking.

## Prerequisites

- PRD exists with `defined` tasks
- All specs created
- Working directory is the project root

## Execution Modes

### Mode 1: Sequential (Default)
Work through tasks one at a time. Safer, easier to debug.

```bash
claude -p "Execute PRD: voice-driven-dev-assistant" --allowedTools "Read,Write,Edit,Bash,Glob,Grep"
```

### Mode 2: Parallel (Workmux)
Use git worktrees for parallel execution. Faster, requires coordination.

```bash
workmux start --prd voice-driven-dev-assistant
```

## Workflow Steps

### Step 1: Load PRD Context

1. Read `.claude/prds/[prd-name]/PRD.md`
2. Read `.claude/prds/[prd-name]/tasks.yaml`
3. Identify tasks with `status: defined`

### Step 2: For Each Task

#### 2a. Start Task
```bash
.claude/skills/PRD/scripts/update-task-status.sh [prd-name] "[task-name]" in-progress
```

#### 2b. Read Spec
Read `specs/[task-name].md` completely before implementing.

#### 2c. Implement
Follow the spec exactly. Check acceptance criteria as you go.

#### 2d. Validate
```bash
pnpm type-check
pnpm lint 2>/dev/null || true
pnpm test 2>/dev/null || true
```

#### 2e. Update Status

**If successful:**
```bash
.claude/skills/PRD/scripts/update-task-status.sh [prd-name] "[task-name]" completed
```

**If blocked:**
```bash
.claude/skills/PRD/scripts/update-task-status.sh [prd-name] "[task-name]" blocked "Reason"
```

### Step 3: Report Progress

After each task, output:
```
✅ [Task Name] - completed
   Files: src/file.ts, src/other.ts
   Validation: type-check ✓, tests ✓
```

### Step 4: Continue or Finish

- If more `defined` tasks exist → return to Step 2
- If all tasks `completed` → output summary
- If blocked → document and continue to next task

## Integration with Workmux

When using workmux for parallel execution, add post-merge hook:

```yaml
# .workmux.yaml
post_merge:
  - |
    TASK_NAME=$(git branch --show-current)
    .claude/skills/PRD/scripts/update-task-status.sh [prd-name] "$TASK_NAME" completed
```

## Autonomous Execution Prompt

Use this prompt for fully autonomous execution:

```
You are executing the PRD at .claude/prds/[prd-name]/

CRITICAL RULES:
1. ALWAYS update task status using .claude/skills/PRD/scripts/update-task-status.sh
2. Read the full spec before implementing ANY task
3. Validate with pnpm type-check before marking complete
4. If blocked, mark as blocked with reason and continue to next task
5. Work through tasks in order (top-level sequential, subtasks can be parallel)

Start by reading tasks.yaml and finding the first task with status: defined
```

## Verification

Check progress anytime:
```bash
.claude/skills/PRD/scripts/task-status.sh [prd-name]
```
