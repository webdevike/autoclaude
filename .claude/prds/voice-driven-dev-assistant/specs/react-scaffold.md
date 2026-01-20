# React App Scaffold

## Objective

Initialize a Vite + React + TypeScript application in the `web/` package.

Expected outcome:
- Vite-powered React app
- WebSocket hook for server communication
- Basic layout component

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: Initialize workspace
- **Dependents**: Push-to-talk, Progress display, Text input

## Acceptance Criteria

- [ ] `pnpm dev` starts Vite dev server on localhost:5173
- [ ] WebSocket hook connects to server
- [ ] Basic layout renders

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to create | `web/src/App.tsx`, `web/src/hooks/useWebSocket.ts` |
| Dependencies | `react`, `react-dom`, `vite`, `@vitejs/plugin-react` |

## Out of Scope

- Styling beyond minimal CSS
- Routing
