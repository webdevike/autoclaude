# PRD Implementation Guide

This file is only loaded when needed (progressive disclosure).

## Complete Workflow

### Phase 1: Preparation

1. **Load PRD context**
   ```
   Read: .claude/prds/[name]/PRD.md
   ```
   Understand the objective, constraints, and architecture.

2. **Review task list**
   ```
   Read: .claude/prds/[name]/tasks.yaml
   ```
   Find tasks with `status: defined` - these are ready to implement.

3. **Load task specification**
   ```
   Read: .claude/prds/[name]/specs/[task-spec].md
   ```
   This contains acceptance criteria and code examples.

### Phase 2: Implementation

1. **Gather context** - Read all relevant files mentioned in spec
2. **Implement changes** - Follow the spec exactly, no scope creep
3. **Respect constraints** - Check PRD.md technical constraints section

### Phase 3: Verification

Before marking a task `completed`:

1. **Run the QA pipeline** (REQUIRED for autonomous validation):
   ```bash
   FRONTEND_URL=http://localhost:5173 .claude/scripts/qa-pipeline.sh /path/to/project
   ```

2. **Verify all checks pass**:
   - [ ] Types pass (no TypeScript errors)
   - [ ] Lint passes (warnings OK, errors must be fixed)
   - [ ] Build succeeds
   - [ ] Tests pass
   - [ ] No console errors in browser (if frontend)
   - [ ] No high/critical security vulnerabilities

3. **Verify spec criteria**:
   - [ ] All acceptance criteria in spec are met
   - [ ] Changes align with PRD architecture

See `.claude/specs/validation-requirements.md` for detailed requirements.

### Phase 4: Update Status

Edit `tasks.yaml` to update the task:

```yaml
- name: The task name
  description: ...
  status: completed  # Changed from 'defined'
  spec: specs/the-task.md
```

## Anti-Patterns

❌ **Don't** mark tasks complete without verifying criteria
❌ **Don't** implement beyond what the spec describes
❌ **Don't** skip reading the PRD.md constraints
❌ **Don't** proceed when blocked - document and escalate

## Output Format

When completing a task, provide:

```json
{
  "status": "completed",
  "summary": "Brief description of what was done",
  "changes": [
    {"file": "path/to/file.ts", "action": "created", "reason": "..."},
    {"file": "path/to/other.ts", "action": "modified", "reason": "..."}
  ]
}
```
