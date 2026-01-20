# OpenAI Realtime Integration

## Objective

Integrate with OpenAI's Realtime API for voice interactions, including audio streaming and function calling.

Expected outcome:
- Voice Controller managing OpenAI connection
- Function definitions for Claude Code operations
- Bidirectional audio streaming

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: Server Core
- **Dependents**: End-to-End Integration

## Subtasks

1. **Voice controller** - OpenAI Realtime WebSocket management
2. **Function definitions** - Tools for Claude Code operations
3. **Audio streaming** - Bidirectional audio handling

## Acceptance Criteria

- [ ] Connects to OpenAI Realtime API
- [ ] Sends and receives audio
- [ ] Function calls trigger Claude operations
- [ ] Voice output plays correctly

## Out of Scope

- Custom voices (using Cedar/Marin)
- Advanced VAD configuration
