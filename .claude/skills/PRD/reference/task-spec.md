# Task Specification Template

Standard format for task specification files.

## File Location

```
.claude/prds/[prd-name]/specs/[task-name].md
```

The path is defined in `tasks.yaml` via the `spec` field.

## Template

```markdown
# [Task Name]

## Objective

[Clear, actionable statement of what this task accomplishes]

Expected outcome:
- [Specific deliverable 1]
- [Specific deliverable 2]

## Context

- **Parent PRD**: [prd-name]
- **Dependencies**: [Tasks that must complete before this one]
- **Dependents**: [Tasks that depend on this one]

## Acceptance Criteria

- [ ] [Specific, verifiable criterion]
- [ ] [Another verifiable criterion]
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] No lint errors

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to modify | `src/existing-file.ts:45-60` |
| Files to create | `src/new-file.ts` |
| Files to delete | `src/deprecated.ts` |
| Key patterns | Follow existing [pattern] in `src/example.ts` |
| Technical constraints | [From PRD constraints] |

### Code References

Relevant existing code:
- `src/file.ts:123` - Similar implementation
- `src/other.ts:45` - Pattern to follow

### Example (Optional)

\`\`\`typescript
// Expected usage or implementation pattern
\`\`\`

## Testing Requirements

- [ ] Unit tests for [component]
- [ ] Integration test for [flow]
- [ ] Manual verification of [behavior]

## Out of Scope

- [Explicitly what this task does NOT include]
- [Prevents scope creep]
```

## Guidelines

### Objective
- Be specific and actionable
- State expected outcomes clearly
- One task = one clear goal

### Acceptance Criteria
- Each criterion must be verifiable
- Use checkbox format for tracking
- Include quality gates (tests, types, lint)

### Implementation Notes
- Use specific file paths with line numbers
- Reference existing patterns to follow
- Note any constraints from the PRD

### Out of Scope
- Explicitly state boundaries
- Prevents scope creep during implementation
- Helps maintain focus

## Quality Checklist

A good task spec:
- [ ] Has clear, actionable objective
- [ ] Lists specific files to modify/create
- [ ] References existing code patterns
- [ ] Has verifiable acceptance criteria
- [ ] Defines what's out of scope
- [ ] Can be completed independently (after dependencies)
