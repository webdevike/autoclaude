# autoclaude

Autonomous PRD workflow system for Claude Code. Build entire features hands-off with automatic task tracking, validation, and progress monitoring.

## Quick Start - Fully Autonomous

### 1. Create a PRD (Interactive)
```bash
# In Claude Code
/prd-create my-feature
```
Answer questions about what you want to build. Claude will research best practices and create the PRD.

### 2. Plan the PRD (Interactive)
```bash
/prd-plan my-feature
```
Claude analyzes the codebase, generates tasks with specs, and asks clarifying questions.

### 3. Execute Autonomously (Hands-Off)
```bash
# Option A: Run in current session
/prd-execute my-feature

# Option B: Spawn in background tmux (recommended for long tasks)
/prd-spawn my-feature
```

### 4. Monitor Progress
```bash
# Check status anytime
/prd-status my-feature

# Or from terminal
.claude/skills/PRD/scripts/task-status.sh my-feature
```

---

## Slash Commands

| Command | Description | Mode |
|---------|-------------|------|
| `/prd-create <name>` | Create new PRD through Q&A | Interactive |
| `/prd-plan <name>` | Generate tasks and specs | Interactive |
| `/prd-execute <name>` | Execute all tasks with tracking | **Autonomous** |
| `/prd-spawn <name>` | Execute in background tmux | **Autonomous** |
| `/prd-status [name]` | Check task completion status | Query |
| `/prd-watch <name>` | Live-watch execution progress | Query |
| `/prd-sync <name>` | Sync task status with actual code | Repair |

---

## Autonomous Execution Details

### What `/prd-execute` Does

For **each task** with `status: defined`:

1. **Marks task `in-progress`** in tasks.yaml
2. **Reads the full spec** from `specs/<task-name>.md`
3. **Implements** following acceptance criteria exactly
4. **Validates** with `pnpm type-check` (or equivalent)
5. **Marks task `completed`** (or `blocked` with reason)
6. **Continues** to next task until all done

### What `/prd-spawn` Does

Same as `/prd-execute` but:
- Runs in a **detached tmux session**
- You can close your terminal and it keeps running
- Attach anytime with `tmux attach -t prd-<name>`

### Running in tmux Manually

```bash
# Create tmux session
tmux new-session -s my-feature

# Run autonomous execution
.claude/skills/PRD/scripts/execute-prd.sh my-feature

# Detach: Ctrl+b then d
# Reattach: tmux attach -t my-feature
```

---

## Full Workflow Example

```bash
# Step 1: Start Claude Code in your project
cd my-project
claude

# Step 2: Create PRD
> /prd-create user-authentication

# (Claude asks questions, you answer)
# (Claude researches with Exa, creates PRD.md)

# Step 3: Plan implementation
> /prd-plan user-authentication

# (Claude explores codebase, generates tasks.yaml + specs/)

# Step 4: Review the plan
> cat .claude/prds/user-authentication/tasks.yaml

# Step 5: Execute autonomously
> /prd-spawn user-authentication

# (Claude works in background)

# Step 6: Check progress periodically
> /prd-status user-authentication

# Output:
# Task                    Status
# ----------------------  ---------
# Project Setup           complete
# Database Schema         complete
# Auth Controller         in-progress
# Frontend Components     defined
# ...
```

---

## Task Status Tracking

The system **automatically tracks** task status in `tasks.yaml`:

| Status | Meaning |
|--------|---------|
| `draft` | Needs specification |
| `defined` | Has spec, ready to implement |
| `in-progress` | Currently being worked on |
| `completed` | Done and validated |
| `blocked` | Cannot proceed (see `blockedReason`) |

### Status Update Commands

```bash
# Update manually if needed
.claude/skills/PRD/scripts/update-task-status.sh <prd> "<task>" completed
.claude/skills/PRD/scripts/update-task-status.sh <prd> "<task>" blocked "reason"

# Sync status with actual code state
/prd-sync my-feature
```

---

## Project Structure

After running the workflow, your project will have:

```
your-project/
├── .claude/
│   ├── commands/              # Slash commands (if local)
│   │   ├── prd-create.md
│   │   ├── prd-execute.md
│   │   └── ...
│   ├── prds/
│   │   └── my-feature/
│   │       ├── PRD.md         # Requirements document
│   │       ├── tasks.yaml     # Task list with statuses
│   │       ├── research.yaml  # Research Q&A
│   │       └── specs/         # Per-task specifications
│   │           ├── setup.md
│   │           ├── auth.md
│   │           └── ...
│   └── skills/
│       └── PRD/               # The PRD skill
└── (your code)
```

---

## Validation & QA

### Automatic Validation

Before marking any task complete, Claude runs:
```bash
pnpm type-check   # TypeScript validation
pnpm lint         # Linting (if configured)
pnpm test         # Tests (if configured)
```

### Frontend Validation with Agent Browser

**For UI/frontend tasks**, Claude uses [Agent Browser](https://github.com/anthropics/agent-browser) to:
- Open the app in a real browser
- Take screenshots to verify UI changes
- Check for console errors
- Validate that components render correctly

```bash
# Install Agent Browser globally
npm install -g agent-browser

# Claude will automatically use it for frontend verification
# Make sure your dev server is running:
pnpm dev  # or npm run dev
```

**In your task specs**, include visual acceptance criteria:
```markdown
## Acceptance Criteria
- [ ] Button renders with correct styling
- [ ] Click triggers expected action
- [ ] No console errors
- [ ] Responsive on mobile viewport
```

Claude will use Agent Browser to verify these before marking the task complete.

### QA Pipeline (Full Validation)

For comprehensive checks including browser validation:
```bash
# Start your dev server first
pnpm dev &

# Run full QA pipeline
FRONTEND_URL=http://localhost:3000 ./scripts/qa-pipeline.sh /path/to/project
```

**QA Pipeline checks:**
| Check | Tool | What it validates |
|-------|------|-------------------|
| Types | `tsc --noEmit` | TypeScript compilation |
| Lint | ESLint | Code style issues |
| Build | `npm run build` | Production build works |
| Tests | `npm test` | Unit/integration tests |
| Frontend | curl | Server responds with HTML |
| Console | **Agent Browser** | No browser console errors |
| Secrets | grep patterns | No hardcoded credentials |
| Deps | `npm audit` | No vulnerable dependencies |

---

## Autonomy Rules

### Agent Decides Autonomously
- Implementation details within spec
- Code style and formatting
- Library choices (when multiple valid options)
- Error handling patterns
- File organization

### Agent Blocks (Asks for Help)
- Ambiguous business requirements
- Breaking changes to existing APIs
- Missing critical information
- Security-sensitive decisions

When blocked, the task is marked `blocked` with a reason, and Claude continues to the next task.

---

## Installation

### Option 1: Copy to Your Project
```bash
# Copy the .claude directory to your project
cp -r autoclaude/.claude your-project/.claude
```

### Option 2: Global Commands
```bash
# Copy commands to global Claude config
cp autoclaude/.claude/commands/* ~/.claude/commands/
```

### Option 3: Plugin (Coming Soon)
```bash
/plugin marketplace add webdevike/autoclaude
```

---

## Configuration

### For Parallel Execution (Workmux)

If using workmux for parallel task execution, add to `.workmux.yaml`:

```yaml
post_merge:
  - |
    if [[ -f .claude/.current-prd ]]; then
      PRD_NAME=$(cat .claude/.current-prd)
      BRANCH_NAME="${WORKMUX_BRANCH:-unknown}"
      .claude/skills/PRD/scripts/update-task-status.sh "$PRD_NAME" "$BRANCH_NAME" completed
    fi
```

### Environment Variables

```bash
# Required for Exa research
export EXA_API_KEY=your-key

# Required for Claude
export ANTHROPIC_API_KEY=your-key
```

---

## Troubleshooting

### Task status not updating?
```bash
/prd-sync my-feature
```

### Want to restart a task?
```bash
.claude/skills/PRD/scripts/update-task-status.sh my-feature "task-name" defined
```

### Execution stuck?
Check the tmux session:
```bash
tmux attach -t prd-my-feature
```

---

## Requirements

- Claude Code CLI
- Node.js 18+
- pnpm (or npm)
- tmux (for `/prd-spawn`)
- Exa API key (for research)
- **Agent Browser** (for frontend validation): `npm install -g agent-browser`

---

## License

MIT
