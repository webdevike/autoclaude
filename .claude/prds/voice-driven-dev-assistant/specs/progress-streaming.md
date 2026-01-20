# Progress Streaming

## Objective

Stream Claude Code output in real-time to the web UI.

Expected outcome:
- Messages streamed via WebSocket as they arrive
- Messages categorized by type (text, tool_use, tool_result)

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: Claude Controller
- **Dependents**: Progress Display

## Acceptance Criteria

- [ ] Text messages stream in real-time
- [ ] Tool usage events include tool name
- [ ] Long content truncated for display

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to modify | `server/src/claude-controller.ts` |
| Key patterns | Event forwarding to WebSocket |

## Out of Scope

- Message persistence
- Filtering
