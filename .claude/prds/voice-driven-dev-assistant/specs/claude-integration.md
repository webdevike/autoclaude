# Claude Code Integration

## Objective

Integrate Claude Code via the Agent SDK to perform development operations triggered by voice commands.

Expected outcome:
- Claude Controller spawning and managing Claude Code
- Progress streaming to web UI
- Result summarization for voice feedback

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: Server Core
- **Dependents**: End-to-End Integration

## Subtasks

1. **Claude controller** - Agent SDK integration
2. **Progress streaming** - Real-time output to UI
3. **Result summarization** - Capture for voice summary

## Acceptance Criteria

- [ ] Claude Code spawns via Agent SDK
- [ ] Streaming output reaches web UI
- [ ] Results captured for summarization
- [ ] Cancellation works

## Out of Scope

- Custom tools beyond default Claude Code tools
- Permission prompts (auto-approve in V1)
