# Error Handling

## Objective

Handle failures gracefully with appropriate voice and visual feedback.

Expected outcome:
- Errors announced via voice
- Error state shown in UI
- Recovery possible without restart

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: All controllers
- **Dependents**: None

## Acceptance Criteria

- [ ] OpenAI connection errors announced
- [ ] Claude Code errors announced
- [ ] WebSocket disconnection handled
- [ ] State resets to idle after error
- [ ] Retry possible after error

## Error Scenarios

1. **OpenAI API error**: Announce "I'm having trouble connecting to the voice service"
2. **Claude Code error**: Announce "Claude encountered an error: [brief description]"
3. **WebSocket disconnect**: Show reconnecting UI, auto-reconnect
4. **Timeout**: Announce "The operation is taking too long, would you like to cancel?"

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to modify | All controllers, state machine |

## Out of Scope

- Error logging/reporting infrastructure
- Retry policies with backoff
