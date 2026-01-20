# Configure TypeScript

## Objective

Set up shared TypeScript configuration for the monorepo with appropriate settings for Node.js (server) and browser (web) targets.

Expected outcome:
- Root `tsconfig.json` with shared base config
- `server/tsconfig.json` extending base with Node.js settings
- `web/tsconfig.json` extending base with browser/React settings

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: Initialize workspace
- **Dependents**: All code tasks

## Acceptance Criteria

- [ ] Root `tsconfig.json` exists with shared compiler options
- [ ] Server tsconfig targets ES2022/Node
- [ ] Web tsconfig targets ESNext with React JSX
- [ ] `tsc --noEmit` passes in both packages
- [ ] Path aliases work if configured

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to create | `tsconfig.json`, `server/tsconfig.json`, `web/tsconfig.json` |
| Key patterns | Use `extends` for config inheritance |
| Technical constraints | Strict mode enabled |

### Example

```json
// tsconfig.json (root)
{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}

// server/tsconfig.json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

## Testing Requirements

- [ ] `tsc --noEmit` passes in server
- [ ] `tsc --noEmit` passes in web

## Out of Scope

- ESLint/Prettier configuration
- Build tooling beyond TypeScript
