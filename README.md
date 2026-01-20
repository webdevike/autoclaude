# autoclaude

Autonomous PRD workflow system for Claude Code. A structured approach to building features from Product Requirement Documents with built-in validation and QA.

## Installation

### From GitHub
```bash
/plugin marketplace add ike/autoclaude
```

### Local Testing
```bash
claude --plugin-dir ./autoclaude
```

## Skills

### PRD Skill (`/prd`)

The main skill with three workflows for the complete PRD lifecycle:

| Trigger | Workflow | Description |
|---------|----------|-------------|
| "create prd", "new prd", "start prd" | CreatePRD | Gather requirements, create PRD.md |
| "plan prd", "break down", "create tasks" | PlanPRD | Analyze PRD, research, create tasks.yaml |
| "work on", "implement", "build" | WorkPRD | Execute tasks with validation |

## Structure

```
autoclaude/
├── .claude-plugin/
│   ├── plugin.json          # Plugin manifest
│   └── marketplace.json     # Marketplace metadata
├── skills/
│   └── PRD/
│       ├── SKILL.md         # Main skill with routing
│       ├── workflows/
│       │   ├── CreatePRD.md # Information gathering workflow
│       │   ├── PlanPRD.md   # Analysis & planning workflow
│       │   └── WorkPRD.md   # Implementation workflow
│       ├── reference/
│       │   ├── prd-spec.md  # PRD file format reference
│       │   └── task-spec.md # Task specification template
│       ├── schemas/
│       │   ├── tasks.schema.json    # JSON Schema for tasks.yaml
│       │   └── research.schema.json # JSON Schema for research.yaml
│       └── scripts/
│           ├── list-prds.sh         # List all PRDs with status
│           ├── list-defined-tasks.sh # Tasks ready to implement
│           ├── list-draft-tasks.sh   # Tasks needing specs
│           ├── task-status.sh        # Get specific task status
│           ├── update-task-status.sh # Update task status
│           └── research-status.sh    # Check research completion
├── scripts/
│   └── qa-pipeline.sh       # Comprehensive QA validation
└── hooks/
    └── hooks.json           # PostToolUse validation hooks
```

## Workflows

### 1. CreatePRD - Requirements Gathering

Triggered by: "create prd", "new prd", "start prd", "new feature"

Creates the foundation:
- `.claude/prds/<name>/PRD.md` - Requirements document
- Gathers: goals, users, features, constraints, success metrics

### 2. PlanPRD - Analysis & Task Creation

Triggered by: "plan prd", "break down", "create tasks", "analyze prd"

12-step process:
1. Parse PRD sections
2. Identify research questions
3. Conduct research (web search, codebase analysis)
4. Record findings in `research.yaml`
5. Identify task boundaries
6. Create task hierarchy
7. Define dependencies
8. Sequence by dependencies
9. Write task specs
10. Generate `tasks.yaml`
11. Validate with schemas
12. Present summary for approval

### 3. WorkPRD - Implementation

Triggered by: "work on", "implement", "build", "execute"

Per-task cycle:
1. Select next `defined` task
2. Read task spec
3. Implement following acceptance criteria
4. Run QA pipeline (types, lint, tests, build, browser)
5. Mark `completed` or `blocked`
6. Repeat

## Project Structure (Your Project)

```
your-project/
├── .claude/
│   └── prds/
│       └── your-prd/
│           ├── PRD.md           # Requirements document
│           ├── tasks.yaml       # Task list with statuses
│           ├── research.yaml    # Research questions & answers
│           └── specs/           # Detailed specs per task
│               └── task-name.md
├── tsconfig.json
├── .eslintrc.cjs
├── package.json
└── package-lock.json
```

## Task Statuses

| Status | Meaning |
|--------|---------|
| `draft` | Initial definition, needs spec |
| `defined` | Has spec, ready to implement |
| `in-progress` | Currently being worked on |
| `completed` | Done and validated |
| `blocked` | Cannot proceed (has `blockedReason`) |

## QA Pipeline

The `scripts/qa-pipeline.sh` runs 9 validation checks:

1. **Types** - `tsc --noEmit`
2. **Lint** - ESLint with auto-fix option
3. **Build** - `npm run build`
4. **Tests** - `npm test`
5. **Frontend** - Verifies HTML response
6. **Console** - Browser console errors via agent-browser
7. **Secrets** - Scans for hardcoded credentials
8. **Deps** - `npm audit` for vulnerabilities
9. **Review** - Lists uncommitted changes

```bash
# Full pipeline
FRONTEND_URL=http://localhost:3000 ./scripts/qa-pipeline.sh /path/to/project

# With auto-fix
./scripts/qa-pipeline.sh --fix /path/to/project
```

## Automatic Hooks

Real-time validation on every file edit:

- **TypeScript files** - `tsc --noEmit` runs automatically
- **tasks.yaml** - Schema validation ensures valid structure

## Helper Scripts

Available in `skills/PRD/scripts/`:

```bash
# List all PRDs
./list-prds.sh

# Check tasks ready to implement
./list-defined-tasks.sh <prd-name>

# Check tasks needing specs
./list-draft-tasks.sh <prd-name>

# Get task status
./task-status.sh <prd-name> <task-name>

# Update task status
./update-task-status.sh <prd-name> <task-name> <status> [reason]

# Check research progress
./research-status.sh <prd-name>
```

## Autonomy Rules

**Agent Decides:**
- Code style, naming, formatting
- Library choices (if multiple work)
- Implementation details not in spec
- Error handling patterns

**Agent Blocks (writes to blockedReason):**
- Ambiguous business logic
- Breaking changes required
- Missing critical information
- Architectural decisions affecting multiple tasks

## Requirements

- Node.js 18+
- npm
- `check-jsonschema`: `pip install check-jsonschema`
- `agent-browser`: `npm install -g agent-browser`

## License

MIT
