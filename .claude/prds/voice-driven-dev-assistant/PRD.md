# Voice-Driven Development Assistant

## Objective

Build a personal voice-driven development system that uses OpenAI's Real-time API as the conversational interface while Claude Code (headless mode) performs the actual development work. The system allows natural voice conversations to plan, investigate, and implement features, with a web UI to monitor progress.

### Clarifying Questions

- Q: Who is the target user?
  A: Personal tool for my own development workflow.

- Q: What Claude Code operations should be supported?
  A: Full autonomy - planning, coding, file edits, running commands - everything.

- Q: How should long-running tasks be handled?
  A: Web app on local port showing progress, with ability to trigger voice summaries.

- Q: Tech stack preferences?
  A: Whatever works best for the real-time API integration.

- Q: What's out of scope for V1?
  A: Multi-project support, conversation history persistence, mobile/remote access.

## Motivation

Current development workflows require manual typing of prompts and constant context-switching between voice ideas and keyboard input. Voice is 2-3x faster than typing (150+ WPM vs 40-80 WPM), and natural conversation enables better exploration of requirements before implementation.

This system creates a hands-free development experience where I can:
- Think out loud while the AI captures and refines requirements
- Have a back-and-forth conversation to clarify features before building
- Monitor progress visually while continuing to interact via voice
- Get spoken summaries of what Claude Code accomplished

Without this: Continue manually typing prompts, slower iteration, more context-switching friction.

## Research Findings

_Insights gathered from Exa web search:_

### Best Practices

- **OpenAI gpt-realtime model** is production-ready with significant improvements in instruction following, tool calling, and speech naturalness (accuracy 65.6% → 82.8%)
- Use **Cedar or Marin voices** for best assistant voice quality
- **Function calling** enables the real-time API to interface with external systems - perfect for triggering Claude Code operations
- Claude Code headless mode uses `claude -p` flag with `--output-format stream-json` for real-time structured output
- The **Agent SDK** (Python/TypeScript) provides programmatic control with tool approval callbacks and native message objects

### Common Pitfalls

- Function calls can execute simultaneously with audio generation - need to handle timing carefully to avoid interrupting speech
- Real-time API is event-driven, not truly real-time except for input buffering - consider playback pacing
- Long Claude Code operations need progress streaming to avoid silent waiting periods
- Need clear handoff protocol between "conversation mode" and "execution mode"

### Industry Patterns

- **"Vibe coding"** pattern: dictate high-level intent, let AI handle implementation details
- Voice coding tools (WisprFlow, SuperWhisper) show 2x productivity gains over typing
- Successful voice assistants use "speak first, then act" pattern for function calls
- Web dashboards for monitoring are common in multi-agent systems

### Sources

- https://platform.openai.com/docs/guides/function-calling - OpenAI function calling guide
- https://code.claude.com/docs/en/headless - Claude Code programmatic usage docs
- https://dev.to/czmilo/openai-gpt-realtime-complete-guide-revolutionary-breakthrough-in-voice-ai-2025-20m4 - GPT-realtime complete guide
- https://addyo.substack.com/p/speech-to-code-vibe-coding-with-voice - Vibe coding patterns
- https://adrianomelo.com/posts/claude-code-headless.html - Claude Code headless use cases

## Implementation Details

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web Browser (UI)                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Audio Input   │  │  Progress View  │  │   Text Input    │  │
│  │  (Push-to-talk) │  │   (Streaming)   │  │   (Fallback)    │  │
│  └────────┬────────┘  └────────▲────────┘  └────────┬────────┘  │
└───────────┼────────────────────┼────────────────────┼───────────┘
            │ WebSocket          │ WebSocket          │
            ▼                    │                    ▼
┌───────────────────────────────────────────────────────────────────┐
│                     Node.js Server (Orchestrator)                 │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Voice Controller                          │  │
│  │  - Manages OpenAI Realtime WebSocket connection              │  │
│  │  - Handles audio streaming (in/out)                          │  │
│  │  - Routes function calls to Claude Controller                │  │
│  │  - Maintains conversation state machine                      │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                             │                                     │
│  ┌──────────────────────────▼──────────────────────────────────┐  │
│  │                   Claude Controller                          │  │
│  │  - Spawns Claude Code via Agent SDK                          │  │
│  │  - Streams progress to UI via WebSocket                      │  │
│  │  - Handles tool approvals (auto-approve in V1)               │  │
│  │  - Captures results for voice summarization                  │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
            │                                        │
            ▼                                        ▼
┌───────────────────────┐              ┌───────────────────────────┐
│   OpenAI Realtime     │              │     Claude Code           │
│   API (WebSocket)     │              │     (Subprocess)          │
│   - gpt-realtime      │              │     - Agent SDK           │
│   - Cedar/Marin voice │              │     - Full tool access    │
└───────────────────────┘              └───────────────────────────┘
```

**Key Components:**

1. **Web UI (React + Vite)**
   - Push-to-talk button (spacebar) for voice input
   - Real-time progress display (streaming Claude Code output)
   - Text input fallback for non-voice scenarios
   - Audio playback for assistant responses

2. **Node.js Orchestrator Server**
   - Express + WebSocket server
   - Voice Controller: manages OpenAI Realtime connection
   - Claude Controller: manages Claude Code subprocess via Agent SDK
   - State machine: `idle` → `listening` → `processing` → `speaking` → `idle`

3. **OpenAI Realtime Integration**
   - WebSocket connection using `openai` SDK
   - Function calling for Claude Code operations
   - Audio streaming (PCM16 @ 24kHz)

4. **Claude Code Integration**
   - `@anthropic-ai/claude-agent-sdk` for programmatic control
   - Streaming output for progress updates
   - Working directory: current project

### Constraints

- OpenAI Real-time API requires WebSocket connection
- Claude Code headless mode runs as subprocess, output via stdout
- Web UI must run on localhost only (V1 constraint)
- Single project context at a time
- No persistent conversation history in V1
- Must handle audio input/output device selection
- Need API keys for both OpenAI and Anthropic

### Relevant Guides

- OpenAI Realtime WebSocket: https://platform.openai.com/docs/guides/realtime-websocket
- Claude Agent SDK TypeScript: https://platform.claude.com/docs/en/agent-sdk/typescript
- OpenAI Function Calling: https://platform.openai.com/docs/guides/function-calling

### Relevant Files

New project - files will be created:
- `server/` - Node.js orchestrator
- `web/` - React UI
- `package.json` - Workspace root

## Discussion

### Workflow Details

The intended workflow:
1. User speaks a request (e.g., "I want to build user authentication")
2. Real-time API asks clarifying questions via voice
3. Questions and context are passed to Claude Code for investigation
4. Claude Code explores the codebase and may surface follow-up questions
5. Iterate conversation until requirements are clear
6. User approves via voice: "Go ahead and build it"
7. Claude Code executes while web UI shows progress
8. User can ask for voice summaries at any time: "What's happening now?"
9. On completion, real-time API provides spoken summary of changes

### Resolved Questions

- Q: Should the web UI support basic text input as fallback?
  A: Yes - text input for when voice isn't convenient

- Q: How to handle Claude Code errors/failures in voice?
  A: Voice controller announces errors and asks how to proceed

- Q: Wake word vs push-to-talk vs continuous listening?
  A: Push-to-talk (spacebar) - most reliable, no false triggers

### Tech Stack Decisions

- **Backend**: Node.js + TypeScript
- **Frontend**: React + Vite + TypeScript
- **Voice Input**: Push-to-talk (spacebar key)
- **Voice API**: OpenAI Realtime with Cedar/Marin voice
- **Worker**: Claude Agent SDK (@anthropic-ai/claude-agent-sdk)
