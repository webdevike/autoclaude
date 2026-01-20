# Server Core

## Objective

Build the Node.js orchestrator server that manages WebSocket connections, state, and coordinates between the Voice Controller and Claude Controller.

Expected outcome:
- Express server with WebSocket support
- State machine for conversation flow
- Foundation for Voice and Claude integrations

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: Project Setup
- **Dependents**: OpenAI Realtime Integration, Claude Code Integration

## Subtasks

1. **Express WebSocket server** - HTTP server with ws support
2. **State machine** - Conversation state management

## Acceptance Criteria

- [ ] Server starts and accepts WebSocket connections
- [ ] State transitions work correctly
- [ ] Health endpoint returns OK
- [ ] Clean shutdown on SIGTERM

## Out of Scope

- Voice/Claude integration (separate tasks)
- Authentication
