# Architecture: Personal AI Assistant on pi-mono

**Domain:** Self-hosted personal AI assistant
**Researched:** 2026-02-05
**Confidence:** HIGH

## Executive Summary

A personal AI assistant built on pi-mono should be architected as a **channel adapter layer** sitting above pi-mono's agent core, rather than replacing pi-mono components. The migration path involves gradually replacing custom LLM and agent code with pi-mono packages while keeping the domain-specific orchestration logic (channels, integrations, modes, scheduling) intact.

The current Jarvis architecture follows a **Gateway → Orchestrator → Triage → Smart Agent** pattern. The target architecture preserves this flow but delegates the agent loop, LLM calls, and tool execution to pi-mono's proven implementations.

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interfaces                      │
│  Telegram │ WhatsApp │ Slack (pi-mom) │ Web UI │ CLI      │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   Gateway (Channel Router)                   │
│  • Routes messages from channels to appropriate mode        │
│  • Manages placeholder/edit for progress updates            │
│  • Broadcasts scheduled messages                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              Mode Manager + Orchestrator                     │
│  • Switches between personal/work/coding modes              │
│  • Triage: cheap model decides handle vs delegate           │
│  • Session tracking and status updates                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
┌────────▼────────┐        ┌────────▼────────────────────────┐
│  Triage Agent   │        │   pi-mono Agent (Smart Tier)    │
│  (Quick Reply)  │        │  • pi-ai: LLM abstraction       │
│                 │        │  • pi-agent-core: agent loop    │
│  Simple Q&A,    │        │  • Tool execution & streaming   │
│  Commands       │        │  • Session persistence          │
└─────────────────┘        └────────┬────────────────────────┘
                                    │
                  ┌─────────────────┼─────────────────┐
                  │                 │                 │
         ┌────────▼────────┐  ┌────▼────┐  ┌────────▼────────┐
         │  Integrations   │  │  Tools  │  │    Scheduler    │
         │  • Gmail        │  │  • Bash │  │  Cron-triggered │
         │  • Notion       │  │  • Read │  │  agent tasks    │
         │  • Linear       │  │  • Write│  │                 │
         │  • Exa Search   │  │  • Edit │  │                 │
         └─────────────────┘  └─────────┘  └─────────────────┘
```

## Component Boundaries

### 1. Gateway (Keep, Enhance)
**Responsibility:** Channel-agnostic message routing and broadcasting
**Communicates with:** Channels, Mode Manager, Orchestrator
**Keep from current:** Multi-channel architecture, placeholder/edit pattern
**Add:** RPC mode support for embedding in other apps

### 2. Channel Adapters (Keep, Standardize)
**Responsibility:** Protocol-specific I/O (Telegram, Slack, WhatsApp, etc.)
**Communicates with:** Gateway
**Keep from current:** Telegram polling, authentication
**Add:** pi-mom integration for Slack, WhatsApp adapter
**Interface:** `Channel` type from @jarvis/core

### 3. Mode Manager (Keep, Simplify)
**Responsibility:** Context switching between personal/work/coding modes
**Communicates with:** Gateway, Orchestrator
**Keep from current:** Mode configs (system prompt, tiers, integrations)
**Simplify:** Remove mode-specific channel bindings, flatten to preferences

### 4. Orchestrator (Replace Core, Keep Triage)
**Responsibility:** Decides whether to handle quickly or delegate to smart agent
**Communicates with:** Mode Manager, Triage Agent, pi-mono Agent
**Keep from current:** Triage decision logic, session tracking
**Replace:** `runSmartAgent()` internals with pi-mono Agent class
**Add:** Support for pi-coding-agent RPC mode for coding tasks

### 5. pi-mono Agent (New, Core)
**Responsibility:** Agent loop, tool execution, LLM streaming
**Communicates with:** Orchestrator, Tools, Integrations
**Use:** `Agent` class from `@mariozechner/pi-agent-core`
**Use:** `stream()` from `@mariozechner/pi-ai`
**Provides:** Event-driven progress updates, persistent sessions

### 6. Tool Registry (Hybrid)
**Responsibility:** Makes external capabilities available to LLM
**Communicates with:** pi-mono Agent
**Keep from current:** Integration tool wrappers (Gmail, Notion, Linear)
**Replace:** Built-in tools (Bash, Read, Write, Edit) with pi-mono defaults
**Add:** Exa web search tool, preference management tool

### 7. Integration Adapters (Keep, Refactor)
**Responsibility:** Domain-specific API wrappers (Gmail, Notion, Linear, Exa)
**Communicates with:** Tool Registry
**Keep from current:** OAuth flows, API clients, tool definitions
**Refactor:** Convert to pi-mono Extension format for reusability

### 8. Scheduler (Keep, Reconnect)
**Responsibility:** Cron-triggered agent tasks
**Communicates with:** Orchestrator
**Keep from current:** Cron parsing, job queue
**Change:** Trigger pi-mono Agent sessions instead of custom triage/smart flow

### 9. Status Reporter (Keep, Enhance)
**Responsibility:** Periodic summaries of agent activity
**Communicates with:** Orchestrator, Channels
**Keep from current:** Interval-based reporting
**Enhance:** Subscribe to pi-mono Agent events for richer status

### 10. Persistent Preferences (New)
**Responsibility:** User-specific settings, context, memory
**Communicates with:** Mode Manager, pi-mono Agent
**Storage:** JSON file per user (e.g., `~/.jarvis/preferences/telegram_user123.json`)
**Schema:** Structured preferences + unstructured notes

## Data Flow

### Synchronous Request Flow
```
User message
  → Channel (Telegram/Slack)
    → Gateway.handleIncoming()
      → Orchestrator.handleMessage()
        → Triage LLM call (Haiku/cheap)
          ├─ Handle directly → Return text
          └─ DELEGATE marker detected
              → pi-mono Agent.prompt()
                → stream() LLM call
                  → Tool calls detected
                    → Tool.execute()
                      → Integration API call
                    → Results fed back to LLM
                  → Final response
                → Event stream → Progress updates
              → Return text
        → Gateway sends response
      → Channel delivers to user
```

### Asynchronous Scheduler Flow
```
Cron trigger
  → Scheduler.executeCronJob()
    → Orchestrator.handleMessage() (synthetic message)
      → [Same as synchronous flow]
    → Result stored/broadcast via Gateway
```

### Status Update Flow
```
StatusReporter interval tick
  → Orchestrator.getSessions()
  → Orchestrator.getActiveSessions()
  → Format summary
  → Gateway.broadcast()
    → Channels deliver
```

## Migration Path: Current → Target

### Phase 1: Replace LLM Client (Week 1)
**Goal:** Swap `@jarvis/core/LLMClient` with `@mariozechner/pi-ai`

**Changes:**
- Replace `LLMClient.chat()` with `stream()` from pi-ai
- Refactor provider strings: `"openrouter/anthropic/claude-3.5-sonnet"` → pi-ai format
- Update `ModelConfig` type to match pi-ai's provider resolution
- Keep retry logic and fallback behavior

**Dependencies:** None (pure swap)

**Testing:** Triage still works, smart agent loop unchanged

**Risk:** Low (pi-ai is stable, well-documented)

### Phase 2: Replace Agent Loop (Week 2)
**Goal:** Swap `AgentOrchestrator.runSmartAgent()` with pi-mono `Agent` class

**Changes:**
- Import `Agent` from `@mariozechner/pi-agent-core`
- Replace manual tool call loop with `agent.prompt()`
- Subscribe to agent events (`text_delta`, `toolcall_end`, `turn_end`) for progress
- Persist sessions using agent's session management
- Remove custom `maxTurns` logic (pi-mono handles this)

**Dependencies:** Phase 1 (uses pi-ai stream)

**Testing:** Smart agent delegation works, tools execute, progress updates flow

**Risk:** Medium (event model different from current callback approach)

### Phase 3: Standardize Tools (Week 3)
**Goal:** Convert custom tool definitions to pi-mono Extension format

**Changes:**
- Replace built-in tools (Bash, Read, Write, Edit) with pi-mono defaults
- Wrap integration tools (Gmail, Notion, Linear) in pi-mono tool schema (TypeBox)
- Migrate integration code to Extension structure for reusability
- Add Exa web search tool as Extension

**Dependencies:** Phase 2 (agent loop must support extensions)

**Testing:** All existing integrations work via new tool format

**Risk:** Low (mostly mechanical refactoring)

### Phase 4: Add Persistent Preferences (Week 4)
**Goal:** Store per-user context and preferences

**Changes:**
- Create `PreferenceStore` class (JSON file per user)
- Add `get_preference`, `set_preference`, `search_memory` tools
- Inject user preferences into system prompt context
- Add preference management commands to gateway

**Dependencies:** Phase 3 (tool registry established)

**Testing:** Preferences persist across sessions, influence responses

**Risk:** Low (new feature, no breaking changes)

### Phase 5: Integrate pi-coding-agent (Week 5)
**Goal:** Delegate coding tasks to specialized pi-coding-agent

**Changes:**
- Add pi-coding-agent RPC mode integration
- Extend triage logic to detect coding requests
- Route coding tasks to pi-coding-agent process
- Map pi-coding-agent extensions to Jarvis integrations

**Dependencies:** Phase 2 (agent orchestration stable)

**Testing:** Coding requests handled by pi-coding-agent, output formatted for channels

**Risk:** Medium (RPC integration, process management)

### Phase 6: Add Self-Configuration (Week 6)
**Goal:** Agent can modify its own mode configs and scheduled tasks

**Changes:**
- Add `update_mode_config`, `add_cron`, `remove_cron` tools
- Add `switch_mode` tool (already exists as command)
- Persist changes to disk (config files)
- Add confirmation prompts for destructive changes

**Dependencies:** Phase 4 (preferences inform config decisions)

**Testing:** Agent can manage its own schedule and behavior

**Risk:** Medium (file writes, validation needed)

## What to Keep

### From Current Architecture
1. **Gateway pattern** — Multi-channel support is domain-specific, not in pi-mono
2. **Triage decision** — Cost-saving cheap model triage is effective
3. **Mode system** — Personal/work context switching is valuable
4. **Integration adapters** — Gmail, Notion, Linear are custom, not in pi-mono
5. **Scheduler** — Cron-based agent tasks are unique to personal assistant use case

### From pi-mono
1. **Agent loop** — Proven, event-driven, handles edge cases
2. **LLM abstraction** — 20+ providers, context handoff, token tracking
3. **Tool format** — TypeBox schemas, validation, standard interface
4. **Session persistence** — JSONL append-only log, branching support
5. **Extension system** — Hot reload, lifecycle hooks, modular

## What to Replace

### Custom Code → pi-mono
1. **LLMClient** → `@mariozechner/pi-ai/stream()`
2. **Agent loop** → `@mariozechner/pi-agent-core/Agent`
3. **Tool definitions** → pi-mono Extension format with TypeBox
4. **Built-in tools** (Bash, Read, Write) → pi-mono defaults
5. **Session state** → pi-mono session persistence

### Over-abstraction → Simplification
1. **Separate packages for each integration** → Single `extensions/` directory
2. **Mode-specific channel bindings** → Channel-agnostic with user preferences
3. **Status reporter as separate service** → Extension listening to agent events
4. **Tmux window per session** → Optional (pi-coding-agent uses it, Jarvis doesn't need it)

## What to Add

### New Capabilities
1. **Persistent preferences** — Per-user memory and context
2. **Exa web search** — Real-time information retrieval
3. **Self-configuration** — Agent modifies its own settings
4. **pi-coding-agent integration** — Specialized coding tasks
5. **RPC mode** — Embed Jarvis in other apps
6. **Smarter routing** — Context-aware triage (detect coding, search, task management)
7. **Multi-model support** — On-the-fly provider switching (Anthropic → OpenAI fallback)

## Architecture Patterns

### Pattern 1: Channel Adapter Pattern
**What:** Isolate protocol-specific code from business logic
**When:** Supporting multiple messaging platforms (Telegram, Slack, WhatsApp)
**Example:**
```typescript
interface Channel {
  name: string;
  initialize(config: {}, onMessage: (msg: Message) => Promise<void>): Promise<void>;
  send(recipient: string, text: string): Promise<void>;
  sendPlaceholder?(recipient: string, text: string): Promise<string | undefined>;
  editMessage?(recipient: string, messageId: string, text: string): Promise<void>;
  shutdown(): Promise<void>;
}
```
**Why:** Channels are interchangeable, gateway doesn't know protocol details

### Pattern 2: Triage + Delegation
**What:** Cheap model decides whether to handle or delegate to expensive model
**When:** Cost-sensitive applications with mixed simple/complex requests
**Example:**
```typescript
const triageResponse = await llm.chat({ model: haiku, prompt: TRIAGE });
if (triageResponse.includes("DELEGATE:")) {
  return delegateToSmartAgent(task, onProgress);
} else {
  return { text: triageResponse };
}
```
**Why:** 90% of requests are simple (greetings, status checks), save costs

### Pattern 3: Event-Driven Progress
**What:** Agent emits events for each step (thinking, tool call, result)
**When:** Long-running tasks need progress updates to channels
**Example:**
```typescript
agent.subscribe((event) => {
  if (event.type === "text_delta") {
    channel.editMessage(messageId, event.textContent);
  } else if (event.type === "toolcall_end") {
    channel.editMessage(messageId, `Using tool: ${event.toolcall.name}...`);
  }
});
```
**Why:** Users expect real-time feedback, Telegram supports message edits

### Pattern 4: Tool Registry
**What:** Central registry of capabilities available to LLM
**When:** Multiple integrations (Gmail, Notion, Linear) need to be callable
**Example:**
```typescript
orchestrator.registerTool({
  name: "gmail_search",
  description: "Search emails in Gmail",
  parameters: Type.Object({ query: Type.String() }),
  execute: async (params) => gmailClient.search(params.query),
});
```
**Why:** Integrations are pluggable, LLM discovers tools via registry

### Pattern 5: Mode as Context
**What:** Predefined profiles (personal/work/coding) shape behavior
**When:** Same assistant needs different personalities/tools per context
**Example:**
```typescript
modes: [
  { mode: "personal", integrations: ["gmail"], channels: ["telegram"] },
  { mode: "work", integrations: ["linear", "notion"], channels: ["slack"] },
  { mode: "coding", tiers: { smart: "pi-coding-agent" }, channels: ["cli"] },
]
```
**Why:** Users want different behavior for work vs personal, not separate bots

## Anti-Patterns to Avoid

### Anti-Pattern 1: Forking pi-mono
**What:** Copying pi-mono packages into monorepo and modifying internals
**Why bad:** Lose upstream updates, increase maintenance burden
**Instead:** Use pi-mono as dependencies, extend via Extension system

### Anti-Pattern 2: Over-packaging
**What:** Separate npm package for each small integration (linear, notion, gmail)
**Why bad:** Cognitive overhead, harder to share code, version coordination
**Instead:** Single `extensions/` directory with shared utilities

### Anti-Pattern 3: Synchronous Tool Execution
**What:** Blocking agent loop while tool executes
**Why bad:** Long-running tools (API calls) freeze progress updates
**Instead:** Use pi-mono's async tool execution with event streaming

### Anti-Pattern 4: Stateless Sessions
**What:** Treating each message as independent request
**Why bad:** No memory of past interactions, can't reference previous context
**Instead:** Use pi-mono's session persistence (JSONL log) with branching

### Anti-Pattern 5: Hard-coded Model IDs
**What:** Directly referencing model strings in code
**Why bad:** Model versions change, providers deprecate models
**Instead:** Store in config files, allow runtime override via preferences

## Build Order Dependencies

### Foundation (Weeks 1-2)
1. **Phase 1: Replace LLM Client** — No dependencies
2. **Phase 2: Replace Agent Loop** — Depends on Phase 1

### Core Features (Weeks 3-4)
3. **Phase 3: Standardize Tools** — Depends on Phase 2
4. **Phase 4: Add Persistent Preferences** — Depends on Phase 3

### Advanced Features (Weeks 5-6)
5. **Phase 5: Integrate pi-coding-agent** — Depends on Phase 2
6. **Phase 6: Add Self-Configuration** — Depends on Phase 4

### Parallel Work
- **Channels** can be refactored independently (no dependencies)
- **Integrations** can be converted to Extensions during Phase 3
- **Scheduler** can be updated once agent loop is stable (after Phase 2)
- **Status Reporter** can be converted to Extension during Phase 3

## Scalability Considerations

| Concern | At 1 User | At 10 Users | At 100 Users |
|---------|-----------|-------------|--------------|
| **LLM Costs** | Triage saves 70% | Triage + caching saves 80% | Add user quotas, rate limits |
| **State Storage** | JSON files in `~/.jarvis/` | Same (1 file per user) | Migrate to SQLite or Redis |
| **Message Queue** | In-memory | In-memory | Redis queue with workers |
| **Session Count** | 1-2 concurrent | 5-10 concurrent | Pool of agent processes |
| **Integration Rate Limits** | No issues | Gmail/Linear quotas matter | Need backoff, retries, user auth |

## Key Design Decisions

### Decision 1: Keep Gateway, Use pi-mono for Agent
**Rationale:** Gateway handles domain-specific routing (channels, modes, scheduling). pi-mono excels at agent loop and tool execution. Combining both gives best of both worlds.

### Decision 2: Triage Before pi-mono Agent
**Rationale:** Cheap model triage saves costs (70-90% of requests are simple). pi-mono agent is expensive (Sonnet/Opus). Triage layer filters before delegation.

### Decision 3: Extensions Over Packages
**Rationale:** Current architecture has too many packages (7+). Extensions are simpler, hot-reloadable, and aligned with pi-mono's design.

### Decision 4: Per-User Preferences, Not Per-Mode
**Rationale:** Modes are coarse-grained (personal/work). Users need fine-grained control (notification preferences, memory, custom tools). Preferences are richer.

### Decision 5: JSON for Preferences, JSONL for Sessions
**Rationale:** Preferences are read-heavy, small (JSON is perfect). Sessions are append-heavy, large (JSONL is append-only, compactable).

## Sources

- [pi-mono GitHub Repository](https://github.com/badlogic/pi-mono)
- [pi-mono Package Architecture](https://deepwiki.com/badlogic/pi-mono/1.1-package-architecture)
- [pi-mono Agent Loop Documentation](https://deepwiki.com/badlogic/pi-mono/3.1-agent-and-transport-layer)
- [pi-mono Extension System](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [@mariozechner/pi-ai npm package](https://www.npmjs.com/package/@mariozechner/pi-agent-core)
- [@mariozechner/pi-agent-core npm package](https://www.npmjs.com/package/@mariozechner/pi-agent-core)
- [@mariozechner/pi-coding-agent npm package](https://www.npmjs.com/package/@mariozechner/pi-coding-agent)
- [What I learned building an opinionated and minimal coding agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)
- [Pi: The Minimal Agent Within OpenClaw](https://lucumr.pocoo.org/2026/1/31/pi/)
