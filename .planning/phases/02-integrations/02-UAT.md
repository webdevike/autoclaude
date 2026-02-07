---
status: diagnosed
phase: 02-integrations
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md]
started: 2026-02-05T23:55:00Z
updated: 2026-02-06T00:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Read a file via Telegram
expected: Ask the agent to read a specific file. Agent returns file contents (with line numbers or summary) without errors.
result: pass

### 2. Write/Edit a file via Telegram
expected: Ask the agent to create or edit a file. Agent creates/modifies the file and confirms the change.
result: pass

### 3. Run a shell command via Telegram
expected: Ask the agent to run a command (e.g., "run ls" or "what's my disk usage"). Agent executes the command and returns output.
result: pass

### 4. Web search via Exa
expected: Ask the agent to search the web (e.g., "search the web for latest Node.js release"). Agent returns search results with titles, URLs, and content snippets.
result: issue
reported: "this was the response I apologize, but I do not have direct web search capabilities as part of my current tool set. The available tools do not include web search functionality."
severity: major

### 5. Gmail integration
expected: Ask the agent to check your email (e.g., "check my recent emails"). Agent lists recent Gmail messages with subjects and senders.
result: skipped
reason: API keys not configured yet

### 6. Linear integration
expected: Ask the agent about Linear issues (e.g., "show my Linear issues"). Agent returns your assigned issues from Linear.
result: pass

### 7. Notion integration
expected: Ask the agent to search Notion (e.g., "search Notion for meeting notes"). Agent returns matching Notion pages.
result: issue
reported: "it acts like its working but hallucintes doing things and gives me links that dont exist"
severity: major

### 8. Coding task delegation
expected: Ask the agent a coding task (e.g., "add a comment to the top of package.json"). Agent delegates to pi-coding-agent, streams progress, and a tmux window appears in the jarvis-agents session.
result: pass

### 9. Triage routing - simple question
expected: Ask a simple question (e.g., "what time is it?" or "hello"). Agent responds directly without delegating to smart agent or coding agent.
result: pass

## Summary

total: 9
passed: 6
issues: 2
pending: 0
skipped: 1

## Gaps

- truth: "Agent returns Exa web search results with titles, URLs, and content snippets"
  status: failed
  reason: "User reported: agent says it does not have web search capabilities, Exa tool not recognized as available"
  severity: major
  test: 4
  root_cause: "Extension tools registered on runtime but never exposed to agent session; session_start event never emitted so Exa client never initializes"
  artifacts:
    - path: "packages/core/src/pi-session.ts"
      issue: "getExtensions() returns raw factory array, not registered tools; no session_start event emitted after extension loading"
    - path: "packages/extensions/exa/index.ts"
      issue: "Client initialization deferred to session_start event that never fires"
    - path: "packages/core/src/agent.ts"
      issue: "Extensions passed to createPiSession but registered tools not propagated to agent"
  missing:
    - "Emit session_start event after extensions are loaded in pi-session.ts"
    - "Fix getExtensions() to return registered tools from runtime"
    - "Verify EXA_API_KEY environment variable is set"
  debug_session: ""

- truth: "Agent returns matching Notion pages from search"
  status: failed
  reason: "User reported: it acts like its working but hallucintes doing things and gives me links that dont exist"
  severity: major
  test: 7
  root_cause: "Notion client never initialized because session_start event never fires; tool returns 'not initialized' error which LLM treats as non-fatal and hallucinates results"
  artifacts:
    - path: "packages/extensions/notion/index.ts"
      issue: "Client initialization deferred to session_start event that never fires; notion variable stays null"
    - path: "packages/core/src/pi-session.ts"
      issue: "Same as Exa - no session_start event emission after extension loading"
  missing:
    - "Same fix as Exa: emit session_start or initialize clients directly in factory"
    - "Return structured error from tools when client is null (prevent LLM hallucination)"
    - "Verify NOTION_API_KEY environment variable is loaded"
  debug_session: ""
