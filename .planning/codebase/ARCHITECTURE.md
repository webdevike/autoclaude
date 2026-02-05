# Architecture

**Analysis Date:** 2026-02-05

## Pattern Overview

**Overall:** Monolithic multi-agent system with message-driven orchestration, plugin-based integrations, and dual LLM-tier architecture.

**Key Characteristics:**
- Two-tier LLM decision making: cheap triage model → expensive smart model for delegation
- Plugin-based integrations and channel adapters
- tmux-based process isolation for long-running agent tasks
- pnpm monorepo with 10+ internal packages
- Event-driven message routing through a central gateway
- Configuration-driven mode system (personal/work contexts)

## Layers

**Presentation/Channels:**
- Purpose: Accept user input from external messaging platforms
- Location: `packages/channels/telegram/src/` and `packages/channels/slack/src/`
- Contains: Channel adapter implementations (`TelegramChannel`, `SlackChannel`)
- Depends on: Core types (`@jarvis/core`)
- Used by: Gateway

**Message Routing (Gateway):**
- Purpose: Route incoming messages to the agent orchestrator, manage mode context
- Location: `packages/gateway/src/index.ts`
- Contains: `Gateway` class that coordinates channels and orchestrator
- Depends on: Core (orchestrator, types), Channel implementations
- Used by: CLI entrypoint

**Agent Orchestration:**
- Purpose: Triage decisions, message handling, session management, tool execution
- Location: `packages/core/src/agent.ts`
- Contains: `AgentOrchestrator` class that coordinates LLM triage and smart agent delegation
- Depends on: LLMClient, TmuxManager, type definitions
- Used by: Gateway, Scheduler, Status Reporter

**LLM Integration:**
- Purpose: Abstract multi-provider LLM communication (Anthropic, OpenAI, OpenRouter)
- Location: `packages/core/src/llm.ts`
- Contains: `LLMClient` with provider-specific implementations
- Depends on: @anthropic-ai/sdk, openai SDK
- Used by: AgentOrchestrator

**Process Management:**
- Purpose: Create and manage tmux windows for long-running agent tasks
- Location: `packages/core/src/tmux.ts`
- Contains: `TmuxManager` for spawning, monitoring, and peeking at agent work
- Depends on: Node.js child_process module
- Used by: AgentOrchestrator, StatusReporter

**Tool Plugins (Integrations):**
- Purpose: Extend agent capabilities via tool definitions
- Location: `packages/integrations/{gmail,notion,linear}/src/`
- Contains: Integration implementations defining tools (e.g., `gmail_list_messages`, `notion_search`)
- Depends on: Integration type interface, external SDKs (googleapis, @notionhq/client)
- Used by: CLI for registration; AgentOrchestrator for execution

**Scheduling:**
- Purpose: Execute agent tasks on cron schedules
- Location: `packages/scheduler/src/index.ts`
- Contains: `Scheduler` class wrapping node-cron
- Depends on: AgentOrchestrator, CronJobConfig types
- Used by: CLI

**Status Reporting:**
- Purpose: Periodically broadcast agent session status and completion events
- Location: `packages/status-reporter/src/index.ts`
- Contains: `StatusReporter` class that polls sessions and publishes updates
- Depends on: AgentOrchestrator, TmuxManager, Channels
- Used by: CLI

**Entrypoint/Bootstrap:**
- Purpose: Load configuration, wire dependencies, start services
- Location: `packages/cli/src/index.ts`
- Contains: Main function orchestrating service initialization
- Depends on: All other packages
- Used by: npm start / bin entry

## Data Flow

**Message Handling Flow:**

1. **User sends message** via Telegram/Slack → `TelegramChannel.poll()` or Slack bot middleware
2. **Channel routes to Gateway** → `Gateway.handleIncoming(msg)`
3. **Gateway enriches message** with mode context, timestamp, uuid
4. **Orchestrator receives message** → `AgentOrchestrator.handleMessage(msg)`
5. **Triage decision**:
   - Send message to cheap triage model (Claude Haiku)
   - Model responds with either direct answer or "DELEGATE:" prefix
6. **If delegated:**
   - Create new `AgentSession` with UUID
   - Spawn tmux window `smart-{sessionId}`
   - Run smart agent loop with tool access
7. **Tool execution:**
   - Smart agent requests tool calls
   - Orchestrator finds tool by name, executes with params
   - Tool results fed back to agent in message loop
8. **Completion:**
   - Agent emits final response
   - Gateway sends response back to originating channel
9. **Status updates:**
   - `StatusReporter` polls sessions every N seconds
   - Broadcasts session status to channels

**State Management:**

- **Agent Sessions:** Stored in `AgentOrchestrator.sessions` Map (in-memory, ephemeral)
- **Mode Context:** Loaded from config JSON, switched via `/mode` command
- **Tools Registry:** Stored in `AgentOrchestrator.tools` Map (registered at startup)
- **Chat History:** Maintained per-session in memory during smart agent loop
- **Tmux Windows:** Persistent across network boundaries (can `/peek` anytime)

## Key Abstractions

**Channel Interface (`packages/core/src/types.ts`):**
- Purpose: Abstract messaging platform differences
- Implementations: `TelegramChannel`, `SlackChannel`
- Pattern: Adapter pattern with common interface (initialize, send, sendPlaceholder, editMessage, shutdown)

**Integration Interface (`packages/core/src/types.ts`):**
- Purpose: Define tool plugin system
- Implementations: `NotionIntegration`, `LinearIntegration`, `GmailIntegration`
- Pattern: Registers tools with the orchestrator; tools are functions with JSON-schema parameters

**ToolDefinition (`packages/core/src/types.ts`):**
- Purpose: Represent a single capability the agent can invoke
- Examples: `gmail_list_messages`, `notion_search`, `linear_get_issues`
- Contains: name, description, JSON-schema parameters, async execute function

**ModeConfig (`packages/core/src/types.ts`):**
- Purpose: Define context-specific agent behavior
- Files: `config/personal.json`, `config/work.json`
- Contains: system prompt, triage/smart model selection, channels, enabled integrations, crons

**AgentSession (`packages/core/src/types.ts`):**
- Purpose: Track state of a delegated task
- Contains: sessionId, tier (triage/smart), mode, tmuxWindow, status (running/completed/failed), lastUpdate

## Entry Points

**CLI Bootstrap (`packages/cli/src/index.ts`):**
- Location: Main executable via `pnpm start`
- Triggers: User runs `pnpm start` or docker container starts
- Responsibilities:
  - Load `.env` and mode configs
  - Initialize LLMClient with API keys
  - Create AgentOrchestrator and TmuxManager
  - Register integrations and channels
  - Start Gateway, Scheduler, StatusReporter
  - Set up graceful shutdown handlers

**Gateway Message Handler (`packages/gateway/src/index.ts`):**
- Location: `Gateway.handleIncoming()`
- Triggers: Channel receives message from user
- Responsibilities:
  - Normalize message (add defaults: id, timestamp, mode)
  - Send placeholder message ("Thinking...")
  - Call `orchestrator.handleMessage()`
  - Update or send response back to channel
  - Handle errors gracefully

**Orchestrator Triage (`packages/core/src/agent.ts`):**
- Location: `AgentOrchestrator.handleMessage()`
- Triggers: Gateway routes message, or Scheduler fires cron job
- Responsibilities:
  - Check for built-in commands (/mode, /sessions, /peek)
  - Call triage LLM with message
  - Parse delegation signal
  - Delegate to smart agent or return direct response

**Agent Loop (`packages/core/src/agent.ts`):**
- Location: `AgentOrchestrator.runSmartAgent()`
- Triggers: Triage detects complex request
- Responsibilities:
  - Call smart LLM with system prompt, tools, message history
  - Parse tool calls from response
  - Execute tools and feed results back
  - Loop until agent stops requesting tools or max turns reached

## Error Handling

**Strategy:** Graceful degradation with user notification.

**Patterns:**

- **API Transient Errors:** LLMClient retries with exponential backoff (1s, 2s) for fetch failures
- **API Fatal Errors:** Caught and returned as error text to user
- **Channel Errors:** Gateway catches and sends error message via channel
- **Tool Execution Errors:** Caught, logged, and fed back to agent as failure signal
- **Missing Configuration:** Startup fails with clear error message (no mode configs, missing API keys)
- **Telegram Token Invalid:** Gracefully disables Telegram channel, continues with other channels
- **Tool Not Found:** Orchestrator silently skips if tool name doesn't match registry

## Cross-Cutting Concerns

**Logging:** Simple console.log with prefixes:
- `[llm]` for LLM provider calls
- `[gateway]` for message routing
- `[telegram]` / `[slack]` for channel events
- `[scheduler]` for cron execution
- `[status-reporter]` for status broadcasts

**Validation:**
- Mode name validation (available in orchestrator.modes)
- Cron expression validation via node-cron.validate()
- Telegram allowed users list checked during message ingestion

**Authentication:**
- Telegram: Allowlist of usernames/IDs via `TELEGRAM_ALLOWED_USERS` env var
- Gmail/Notion/Linear: OAuth tokens or API keys in `.env`, handled by respective SDKs
- Channel modes bound to specific integrations (work mode uses Linear, personal uses Notion)

---

*Architecture analysis: 2026-02-05*
