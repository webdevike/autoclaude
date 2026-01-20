# CreatePRD Workflow

Create a new Product Requirements Document through structured information gathering.

## Prerequisites

- User has expressed intent to create a new feature/project
- No existing PRD for this feature

## Workflow Steps

### Step 1: Information Gathering

Ask the user these questions (adapt based on context):

**Objective:**
- "What problem are you trying to solve?"
- "What should this feature/project accomplish?"
- "Who is the target user?"

**Motivation:**
- "Why is this important now?"
- "What value does this provide?"
- "What happens if we don't build this?"

**Constraints:**
- "Are there technical constraints I should know about?"
- "Any performance requirements?"
- "Compatibility requirements?"
- "What's explicitly out of scope?"

### Step 2: Create PRD Directory

```bash
mkdir -p .claude/prds/[prd-name]/specs
```

Use kebab-case for `[prd-name]` (e.g., `user-authentication`, `payment-processing`).

### Step 3: Create PRD.md

Create `.claude/prds/[prd-name]/PRD.md` with this structure:

```markdown
# [Feature Name]

## Objective

[Clear statement of what we're building and why]

### Clarifying Questions

- Q: [Question asked during creation]
  A: [User's answer]

## Motivation

[Why this matters, what problem it solves, impact if not built]

## Implementation Details

### Architecture

_To be determined during planning phase._

### Constraints

- [Technical constraint 1]
- [Performance requirement]
- [Compatibility requirement]

### Relevant Guides

_To be populated during planning phase._

### Relevant Files

_To be populated during planning phase._

## Discussion

[Any additional Q&A from the creation process]
```

### Step 4: Create Initial tasks.yaml

Create `.claude/prds/[prd-name]/tasks.yaml`:

```yaml
# [Feature Name] Tasks
# Tasks will be generated during planning phase

[]
```

### Step 5: Report Results

Summarize:
- PRD created at `.claude/prds/[prd-name]/PRD.md`
- Ready for planning phase
- Suggest: "Run `/autoclaude:PRD` and say 'plan [prd-name]' to generate tasks"

## Important Notes

- **Do NOT** fill in Architecture, Relevant Guides, or Relevant Files during creation
- **Do NOT** generate tasks during creation - that's the planning phase
- **Do** capture all clarifying Q&A in the PRD
- Keep the PRD focused and avoid scope creep
