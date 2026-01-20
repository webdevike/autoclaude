# Audio Streaming

## Objective

Handle bidirectional audio streaming between browser and OpenAI Realtime API.

Expected outcome:
- Browser audio forwarded to OpenAI via server
- OpenAI audio forwarded to browser for playback
- PCM16 @ 24kHz format handling

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: Voice Controller
- **Dependents**: E2E Integration

## Acceptance Criteria

- [ ] Audio from browser reaches OpenAI API
- [ ] Audio from OpenAI plays in browser
- [ ] Audio can be interrupted

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to create | `web/src/utils/audio.ts` |
| Key patterns | Base64 encoding for WebSocket, AudioContext for playback |

## Out of Scope

- Echo cancellation
- Noise suppression
