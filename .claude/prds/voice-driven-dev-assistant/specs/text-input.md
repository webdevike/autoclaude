# Text Input Fallback

## Objective

Provide a text input field for non-voice interaction with the assistant.

Expected outcome:
- Text input component
- Messages sent via WebSocket
- Works alongside voice input

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: React scaffold
- **Dependents**: E2E Integration

## Acceptance Criteria

- [ ] Text input field renders
- [ ] Enter key sends message
- [ ] Input clears after send
- [ ] Disabled while processing

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to create | `web/src/components/TextInput.tsx` |

## Out of Scope

- Message history display
- Rich text formatting
