# PRD Specification

Standard format for Product Requirements Documents.

## File Location

```
.claude/prds/[prd-name]/
├── PRD.md              # Main requirements document
├── tasks.yaml          # Task definitions
├── research.yaml       # Research questions (optional)
└── specs/              # Task specifications
    ├── task-one.md
    └── task-two.md
```

Use kebab-case for `[prd-name]` (e.g., `user-authentication`).

## PRD.md Structure

```markdown
# [Feature Name]

## Objective

[Clear statement of what we're building]

### Clarifying Questions

- Q: [Question]
  A: [Answer]

## Motivation

[Why this matters, problem being solved, impact]

## Implementation Details

### Architecture

[High-level technical approach]

### Constraints

- [Technical constraints]
- [Performance requirements]
- [Compatibility requirements]

### Relevant Guides

- [Links to documentation]
- [Internal guides]

### Relevant Files

- `src/relevant/file.ts` - [Why relevant]

## Discussion

[Additional Q&A, decisions made, alternatives considered]
```

## tasks.yaml Structure

```yaml
- name: Task Name
  description: What this task accomplishes
  status: draft | defined | in-progress | completed | blocked
  spec: specs/task-name.md
  blockedReason: "Required if status is blocked"
  subtasks:
    - name: Subtask Name
      description: Subtask description
      status: defined
      spec: specs/subtask-name.md
```

### Task Statuses

| Status | Meaning |
|--------|---------|
| `draft` | Initial definition, spec not complete |
| `defined` | Spec complete, ready to implement |
| `in-progress` | Currently being worked on |
| `completed` | Done and validated |
| `blocked` | Cannot proceed (requires `blockedReason`) |

### Execution Order

- **Top-level tasks**: Execute sequentially
- **Subtasks**: Can execute in parallel

### Spec Requirement

Every leaf task (task without subtasks) **must** have a `spec` file.

## research.yaml Structure (Optional)

```yaml
- text: "Research question?"
  mode: answer           # Quick lookup
  answer: "Found answer"
  citations:
    - url: https://example.com
      title: Source Title

- text: "Complex research topic?"
  mode: deep-research    # Comprehensive research
  answer: |
    Detailed findings...
```

## Path Resolution

All relative paths in PRD files are relative to the PRD directory, not the repository root.

Example: If PRD is at `.claude/prds/my-feature/PRD.md`, then `specs/task.md` refers to `.claude/prds/my-feature/specs/task.md`.

## Temporary Files

Store temporary/working files within the PRD directory:
```
.claude/prds/[prd-name]/tmp/
```
