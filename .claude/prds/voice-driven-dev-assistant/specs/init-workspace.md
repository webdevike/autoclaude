# Initialize Workspace

## Objective

Create a pnpm monorepo workspace with two packages: `server` (Node.js orchestrator) and `web` (React UI).

Expected outcome:
- Root `package.json` with workspace configuration
- `pnpm-workspace.yaml` defining packages
- `server/` and `web/` directories with their own `package.json`

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: None (first task)
- **Dependents**: All other tasks

## Acceptance Criteria

- [ ] Root `package.json` exists with `"private": true` and scripts
- [ ] `pnpm-workspace.yaml` lists `server` and `web` packages
- [ ] `server/package.json` has correct name and type module
- [ ] `web/package.json` has correct name
- [ ] `pnpm install` succeeds without errors

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to create | `package.json`, `pnpm-workspace.yaml`, `server/package.json`, `web/package.json` |
| Key patterns | Use pnpm workspaces for monorepo |
| Technical constraints | Node.js 20+, pnpm 8+ |

### Example

```json
// pnpm-workspace.yaml
packages:
  - 'server'
  - 'web'
```

```json
// package.json (root)
{
  "name": "voice-dev-assistant",
  "private": true,
  "scripts": {
    "dev": "pnpm -r dev",
    "build": "pnpm -r build"
  }
}
```

## Testing Requirements

- [ ] `pnpm install` completes successfully
- [ ] Both packages are recognized by pnpm

## Out of Scope

- Installing dependencies (separate task)
- TypeScript configuration (separate task)
