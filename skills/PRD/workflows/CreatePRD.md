# CreatePRD Workflow

Create a new Product Requirements Document through structured information gathering and research.

## Prerequisites

- User has expressed intent to create a new feature/project
- No existing PRD for this feature

## Workflow Steps

### Step 1: Initial Information Gathering

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

### Step 2: Research with Exa

Use **Exa web search** to inform the PRD with industry knowledge:

**Research queries to run:**
- "[feature type] best practices [year]"
- "[feature type] common pitfalls to avoid"
- "[technology/framework] [feature type] implementation patterns"
- "companies that built [similar feature] architecture"

**What to look for:**
- Industry best practices and standards
- Common implementation patterns
- Security considerations
- Performance benchmarks
- UX patterns that work well
- Edge cases others have encountered

**Document findings:**
- Note relevant insights in the PRD's "Research Findings" section
- Include citations/links for reference
- Highlight anything that affects scope or constraints

### Step 3: Create PRD Directory

```bash
mkdir -p .claude/prds/[prd-name]/specs
```

Use kebab-case for `[prd-name]` (e.g., `user-authentication`, `payment-processing`).

### Step 4: Create PRD.md

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

## Research Findings

_Insights gathered from Exa web search:_

### Best Practices
- [Key best practice from research]
- [Another best practice]

### Common Pitfalls
- [Pitfall to avoid]
- [Another pitfall]

### Industry Patterns
- [Pattern used by others]

### Sources
- [URL 1] - [Brief description]
- [URL 2] - [Brief description]

## Implementation Details

### Architecture

_To be determined during planning phase._

### Constraints

- [Technical constraint 1]
- [Performance requirement]
- [Compatibility requirement]
- [Constraint informed by research]

### Relevant Guides

_To be populated during planning phase._

### Relevant Files

_To be populated during planning phase._

## Discussion

[Any additional Q&A from the creation process]
```

### Step 5: Create Initial tasks.yaml

Create `.claude/prds/[prd-name]/tasks.yaml`:

```yaml
# [Feature Name] Tasks
# Tasks will be generated during planning phase

[]
```

### Step 6: Report Results

Summarize:
- PRD created at `.claude/prds/[prd-name]/PRD.md`
- Research conducted (list key findings)
- Ready for planning phase
- Suggest: "Run `/autoclaude:PRD` and say 'plan [prd-name]' to generate tasks"

## Important Notes

- **Do** use Exa to research before writing the PRD
- **Do** capture research findings with sources in the PRD
- **Do** capture all clarifying Q&A in the PRD
- **Do NOT** fill in Architecture, Relevant Guides, or Relevant Files during creation
- **Do NOT** generate tasks during creation - that's the planning phase
- Keep the PRD focused and avoid scope creep
