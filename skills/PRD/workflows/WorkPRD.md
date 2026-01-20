# WorkPRD Workflow

Implement tasks defined in a PRD through systematic execution and validation.

## Prerequisites

- PRD exists with defined tasks (status: `defined`)
- All research completed
- All discussion questions answered
- Task specs exist for all leaf tasks

Run `scripts/list-defined-tasks.sh [prd-name]` to verify readiness.

## Workflow Steps

### Step 1: Select Task

Get the next task to implement:

```bash
./scripts/list-defined-tasks.sh [prd-name]
```

Select tasks in order:
1. Top-level tasks are worked **sequentially**
2. Subtasks under a parent can be worked **in parallel**

### Step 2: Read Task Spec

Load the task specification:
- Read `specs/[task-name].md` completely
- Understand acceptance criteria
- Note dependencies and constraints
- Identify files to modify/create

### Step 3: Implement

Execute the task following the spec:

1. **Read existing code** before making changes
2. **Follow project patterns** and conventions
3. **Implement incrementally** - small, testable changes
4. **Run validation** as you go:
   ```bash
   npm run type-check
   npm run lint
   npm run test
   ```

### Step 4: Validate

Before marking complete, verify ALL acceptance criteria:

- [ ] Each criterion in spec is met
- [ ] TypeScript compiles without errors
- [ ] Lint passes (warnings OK)
- [ ] Tests pass
- [ ] No regressions introduced

Run full QA pipeline:
```bash
FRONTEND_URL=http://localhost:3000 ./scripts/qa-pipeline.sh [project-path]
```

### Step 5: Update Task Status

If successful:
```bash
./scripts/update-task-status.sh [prd-name] [task-name] completed
```

If blocked:
```bash
./scripts/update-task-status.sh [prd-name] [task-name] blocked "Reason for blocker"
```

Document blockers in tasks.yaml with `blockedReason` field.

### Step 6: Update Documentation

Focus on **Why** and **Intent**, not What (code shows what it does).

Update as needed:
- README if user-facing changes
- API documentation if endpoints changed
- Inline comments for complex logic
- Configuration docs if settings added

### Step 7: Repeat or Report

If more tasks remain:
- Return to Step 1
- Continue until all tasks complete or blocked

When finished, report:

```
## Implementation Summary

### Completed
- [x] Task 1 - Brief description
- [x] Task 2 - Brief description

### Blocked (if any)
- [ ] Task 3 - Blocker reason

### Files Changed
- `src/file.ts` - Added feature X
- `src/other.ts` - Modified for Y

### Key Decisions
- Chose approach A over B because...

### Next Steps
- [Suggestions for follow-up work]
```

## Guidelines

### Do
- Stay focused on spec requirements
- Respect technical constraints from PRD
- Complete all testing before marking done
- Document blockers immediately
- Read surrounding code before editing

### Don't
- Expand scope beyond spec
- Skip validation steps
- Ignore failing tests
- Work around blockers without documenting
- Make changes without understanding context

## Blocker Protocol

When truly blocked:

1. Document in tasks.yaml:
   ```yaml
   - name: Task Name
     status: blocked
     blockedReason: |
       Cannot proceed because X.
       Tried: A, B, C
       Need: User decision on Y
   ```

2. Move to next available task
3. Report blocker in summary
4. Wait for user input if no other tasks
