# PlanPRD Workflow

Analyze an existing PRD, conduct research, and generate implementation tasks.

## Prerequisites

- PRD exists at `.claude/prds/[prd-name]/PRD.md`
- PRD has Objective, Motivation, and Constraints defined
- User wants to plan/break down the work

## Workflow Steps

### Phase 1: Analysis (Steps 1-4)

#### Step 1: Deep PRD Analysis

Read the PRD thoroughly. Evaluate:
- Is the objective clear and specific?
- Are constraints well-defined?
- Are there ambiguities that need clarification?
- What technical decisions need to be made?

#### Step 2: Codebase Exploration

Explore relevant parts of the codebase:
- Identify files that will need modification
- Understand existing patterns and conventions
- Note dependencies and integrations
- Update PRD's "Relevant Files" section

#### Step 3: User Clarification

If ambiguities exist, ask the user:
- Technical approach questions
- Scope clarifications
- Priority decisions

Document all Q&A in the PRD's Discussion section.

#### Step 4: Checkpoint - Re-analysis Needed?

Evaluate if clarifications require re-analysis.
- If yes: Return to Step 1
- If no: Proceed to Phase 2

### Phase 2: Research (Steps 5-7)

#### Step 5: Generate Research Questions

If unknowns exist, create `.claude/prds/[prd-name]/research.yaml`:

```yaml
- text: "How does [library] handle [specific case]?"
  mode: answer  # or deep-research for complex topics

- text: "Best practices for [pattern] in [framework]?"
  mode: answer
```

Maximum 25 questions. Focus on:
- Unknown APIs or libraries
- Best practices for specific patterns
- Integration approaches
- Performance considerations

#### Step 6: Execute Research

For each unanswered question:
- Use web search or code search tools
- Document findings in research.yaml `answer` field
- Include relevant citations

#### Step 7: Checkpoint - Research Impact

Evaluate if findings change previous decisions.
- If yes: Return to Step 1 with new context
- If no: Proceed to Phase 3

### Phase 3: Planning (Steps 8-11)

#### Step 8: Update PRD

Incorporate research findings into PRD:
- Update Architecture section
- Add Relevant Guides
- Refine Constraints if needed
- PRD should be self-contained (no need to reference research.yaml later)

#### Step 9: Generate Tasks

Create/update `.claude/prds/[prd-name]/tasks.yaml`:

```yaml
- name: Setup and Configuration
  description: Initial project setup
  status: draft
  spec: specs/setup.md
  subtasks:
    - name: Initialize project structure
      description: Create directory structure and config files
      status: draft
      spec: specs/init-structure.md

    - name: Configure dependencies
      description: Set up package.json and install deps
      status: draft
      spec: specs/dependencies.md

- name: Core Feature Implementation
  description: Main feature logic
  status: draft
  spec: specs/core-feature.md
```

Rules:
- Top-level tasks are worked **sequentially**
- Subtasks can be worked **in parallel**
- Every leaf task needs a `spec` file
- All tasks start as `draft`

#### Step 10: Create Task Specs

For each leaf task, create spec file following `reference/task-spec.md`:

```markdown
# [Task Name]

## Objective

[Clear, actionable statement of what this task accomplishes]

## Context

- **Parent PRD**: [prd-name]
- **Dependencies**: [tasks that must complete first]

## Acceptance Criteria

- [ ] [Specific, verifiable criterion]
- [ ] [Another criterion]
- [ ] All tests pass
- [ ] No TypeScript errors

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to modify | `src/file.ts` |
| Files to create | `src/new-file.ts` |
| Key patterns | [Pattern to follow] |

## Out of Scope

- [What this task does NOT include]
```

#### Step 11: Validation

Verify:
- [ ] All research questions answered
- [ ] Discussion questions resolved
- [ ] Objective is clear and actionable
- [ ] Constraints documented
- [ ] All tasks have specs
- [ ] Acceptance criteria are verifiable

Update task statuses from `draft` to `defined`.

### Step 12: Report Results

Summarize:
- Tasks generated (count)
- Research conducted (if any)
- Key architectural decisions
- Suggest: "Run `/autoclaude:PRD` and say 'work on [prd-name]' to start implementation"
