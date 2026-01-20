---
name: init-prd
description: Initialize a new PRD structure in the current project
version: 1.0.0
triggers:
  - "init prd"
  - "new prd"
  - "create prd"
---

# Initialize PRD

Create the directory structure for a new Product Requirement Document.

## Usage

When the user wants to start a new PRD, create this structure:

```
.claude/
└── prds/
    └── [prd-name]/
        ├── PRD.md
        ├── tasks.yaml
        └── specs/
```

## PRD.md Template

```markdown
# [Project Name]

## Objective
[What are we building and why?]

## Technical Stack
- Runtime: [Node.js/Bun]
- Framework: [React/Vue/Express/etc.]
- Language: TypeScript

## Architecture
[High-level architecture description]

## Constraints
- [List technical constraints]
- [Performance requirements]
- [Security requirements]

## Out of Scope
- [What we're NOT building]
```

## tasks.yaml Template

```yaml
# [Project Name] Tasks
# Validated against tasks.schema.json

- name: Project Setup
  description: Initialize project structure and dependencies
  status: defined
  spec: specs/project-setup.md

- name: Core Feature
  description: Main feature implementation
  subtasks:
    - name: Subtask 1
      description: First part of core feature
      status: defined
      spec: specs/subtask-1.md
    - name: Subtask 2
      description: Second part of core feature
      status: draft
```

## Spec File Template (specs/*.md)

```markdown
# [Task Name]

## Overview
[What this task accomplishes]

## Requirements
- [Requirement 1]
- [Requirement 2]

## Implementation Notes
[Technical approach]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Tests pass
- [ ] No TypeScript errors
```

## Workflow After Init

1. Fill out PRD.md with project details
2. Break down work into tasks in tasks.yaml
3. Write detailed specs for each task
4. Use `/workflow-automation:prd-workflow` to execute tasks
5. Run `/workflow-automation:qa` before marking tasks complete
