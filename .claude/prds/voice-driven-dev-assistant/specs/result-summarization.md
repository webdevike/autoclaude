# Result Summarization

## Objective

Capture Claude Code results and format them for voice delivery.

Expected outcome:
- Results captured on completion
- Formatted for voice (no code blocks, reasonable length)
- Sent to Voice Controller for speaking

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: Claude Controller
- **Dependents**: E2E Integration

## Acceptance Criteria

- [ ] Final result captured
- [ ] Code blocks replaced with spoken description
- [ ] Summary spoken via Voice Controller

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to modify | `server/src/claude-controller.ts` |

## Out of Scope

- AI-powered summarization
