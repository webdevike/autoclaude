# autoclaude

Autonomous PRD workflow system for Claude Code. Validates code, runs QA pipelines, and executes tasks from structured specifications.

## Installation

### From GitHub
```bash
/plugin marketplace add ike/autoclaude
```

### Local Testing
```bash
claude --plugin-dir ./autoclaude
```

## Features

### 1. PRD Workflow (`/autoclaude:prd-workflow`)

Execute tasks from Product Requirement Documents:
- Read PRD.md → tasks.yaml → specs/
- Implement following acceptance criteria
- Validate with QA pipeline
- Update task status

### 2. QA Pipeline (`/autoclaude:qa`)

Comprehensive validation:
- TypeScript type checking
- ESLint validation
- Build verification
- Unit/integration tests
- Browser console error detection (via agent-browser)
- Security scanning (secrets + npm audit)

### 3. Initialize PRD (`/autoclaude:init-prd`)

Create the directory structure for a new PRD in your project.

### 4. Automatic Hooks

Real-time validation on every file edit:
- **TypeScript files** - `tsc --noEmit` runs automatically
- **tasks.yaml** - Schema validation ensures valid structure

## Project Structure

For the workflow to work, create this structure:

```
your-project/
├── .claude/
│   └── prds/
│       └── your-prd/
│           ├── PRD.md           # Requirements document
│           ├── tasks.yaml       # Task list with statuses
│           └── specs/           # Detailed specs per task
│               └── task-name.md
├── tsconfig.json
├── .eslintrc.cjs
├── package.json (with "test" script)
└── package-lock.json
```

## tasks.yaml Format

```yaml
- name: Feature Name
  description: What this feature does
  status: defined  # draft | defined | in-progress | completed | blocked
  spec: specs/feature-name.md
  subtasks:
    - name: Subtask 1
      description: First subtask
      status: defined
      spec: specs/subtask-1.md
```

## Task Statuses

| Status | Meaning |
|--------|---------|
| `draft` | Initial definition, incomplete |
| `defined` | Has spec, ready to implement |
| `in-progress` | Currently being worked on |
| `completed` | Done and validated |
| `blocked` | Cannot proceed (needs `blockedReason`) |

## Commands

| Command | Description |
|---------|-------------|
| `/autoclaude:prd-workflow` | Execute PRD tasks |
| `/autoclaude:qa` | Run QA pipeline |
| `/autoclaude:init-prd` | Create new PRD structure |

## QA Pipeline Script

Run directly from terminal:

```bash
# Full QA pipeline
FRONTEND_URL=http://localhost:3000 ./scripts/qa-pipeline.sh /path/to/project

# With auto-fix for lint
./scripts/qa-pipeline.sh --fix /path/to/project
```

## Autonomy Rules

**Agent Decides:**
- Code style, naming, formatting
- Library choices (if multiple work)
- Implementation details not in spec

**Agent Asks (via blocker):**
- Ambiguous business logic
- Breaking changes required
- Architectural decisions affecting multiple tasks

## Requirements

- Node.js 18+
- npm
- `check-jsonschema`: `pip install check-jsonschema`
- `agent-browser`: `npm install -g agent-browser`

## License

MIT
