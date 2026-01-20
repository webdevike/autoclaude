---
name: qa
description: Run the QA pipeline to validate code quality
version: 1.0.0
triggers:
  - "run qa"
  - "validate"
  - "check code"
---

# QA Pipeline

Run comprehensive code quality checks on your project.

## Usage

```
/autoclaude:qa [project-path]
```

## What It Checks

1. **Types** - TypeScript compilation
2. **Lint** - ESLint validation
3. **Build** - Production build
4. **Tests** - Unit/integration tests
5. **Frontend** - Browser console errors (if web app)
6. **Security** - Secrets scan + npm audit
7. **Review** - Queue files for code review

## Running the Pipeline

Execute this command to run all checks:

```bash
FRONTEND_URL=http://localhost:5173 ${CLAUDE_PLUGIN_ROOT}/scripts/qa-pipeline.sh [project-path]
```

Options:
- `--fix` - Auto-fix lint issues
- `--verbose` - Show detailed output

## Requirements

For full validation, your project needs:
- `tsconfig.json` - TypeScript config
- `.eslintrc.cjs` or similar - ESLint config
- `package.json` with `test` script - Tests
- `package-lock.json` - For security audit

## Example Output

```
✅ Types
✅ Lint
✅ Build
✅ Tests
✅ Frontend serves HTML
✅ Console (no errors)
✅ Secrets (none found)
✅ Deps (no critical vulns)
✅ Review (queued)

🎉 All checks passed!
```
