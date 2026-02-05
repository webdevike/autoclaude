# Codebase Structure

**Analysis Date:** 2026-02-05

## Directory Layout

```
/Users/ike/Code/autoclaude/
├── packages/                           # pnpm workspace packages
│   ├── core/                          # LLM, orchestration, tmux core
│   │   ├── src/
│   │   │   ├── agent.ts              # AgentOrchestrator class
│   │   │   ├── llm.ts                # LLMClient multi-provider
│   │   │   ├── tmux.ts               # TmuxManager process runner
│   │   │   ├── types.ts              # Shared type definitions
│   │   │   └── index.ts              # Public exports
│   │   └── package.json
│   ├── gateway/                       # Message routing hub
│   │   ├── src/
│   │   │   └── index.ts              # Gateway class
│   │   └── package.json
│   ├── cli/                           # Main entrypoint
│   │   ├── src/
│   │   │   └── index.ts              # Bootstrap and service wiring
│   │   └── package.json
│   ├── channels/
│   │   ├── telegram/                 # Telegram channel adapter
│   │   │   ├── src/
│   │   │   │   └── index.ts          # TelegramChannel class
│   │   │   └── package.json
│   │   └── slack/                    # Slack channel adapter
│   │       ├── src/
│   │       │   └── index.ts          # SlackChannel class
│   │       └── package.json
│   ├── integrations/
│   │   ├── gmail/                    # Gmail tool plugin
│   │   │   ├── src/
│   │   │   │   └── index.ts          # GmailIntegration class
│   │   │   └── package.json
│   │   ├── notion/                   # Notion tool plugin
│   │   │   ├── src/
│   │   │   │   └── index.ts          # NotionIntegration class
│   │   │   └── package.json
│   │   └── linear/                   # Linear tool plugin
│   │       ├── src/
│   │       │   └── index.ts          # LinearIntegration class
│   │       └── package.json
│   ├── scheduler/                     # Cron job engine
│   │   ├── src/
│   │   │   └── index.ts              # Scheduler class
│   │   └── package.json
│   └── status-reporter/               # Status broadcast service
│       ├── src/
│       │   └── index.ts              # StatusReporter class
│       └── package.json
├── config/                            # Mode configuration files
│   ├── personal.json                 # Personal mode config
│   └── work.json                     # Work mode config
├── .planning/                         # GSD documentation
│   └── codebase/
├── .env                              # Runtime environment variables
├── .env.example                      # Example environment template
├── docker-compose.yml                # Docker deployment config
├── Dockerfile                        # Container image
├── package.json                      # Workspace root package.json
├── pnpm-workspace.yaml              # Workspace declaration
├── pnpm-lock.yaml                   # Lockfile
├── tsconfig.json                    # TypeScript configuration
└── README.md                        # Project documentation
```

## Directory Purposes

**packages/core:**
- Purpose: Core runtime — agent orchestration, LLM integration, process management
- Contains: AgentOrchestrator, LLMClient, TmuxManager, type definitions
- Key files: `agent.ts` (orchestration logic), `llm.ts` (multi-provider LLM), `types.ts` (shared contracts)

**packages/gateway:**
- Purpose: Message routing and mode context management
- Contains: Gateway class that binds channels to orchestrator
- Key files: `index.ts` (sole implementation)

**packages/cli:**
- Purpose: Application bootstrap and dependency injection
- Contains: Main entrypoint that wires all services
- Key files: `index.ts` (initialization, config loading, startup)

**packages/channels/telegram:**
- Purpose: Telegram bot channel adapter
- Contains: TelegramChannel implementing manual polling
- Key files: `index.ts` (TelegramChannel class, Telegram API client)

**packages/channels/slack:**
- Purpose: Slack bot channel adapter
- Contains: SlackChannel implementing Slack bolt integration
- Key files: `index.ts` (SlackChannel class, Slack event handling)

**packages/integrations/gmail:**
- Purpose: Gmail API tool plugin
- Contains: GmailIntegration with tools for listing/reading/sending emails
- Key files: `index.ts` (GmailIntegration class, googleapis client)

**packages/integrations/notion:**
- Purpose: Notion API tool plugin
- Contains: NotionIntegration with tools for search/read/create pages
- Key files: `index.ts` (NotionIntegration class, @notionhq/client)

**packages/integrations/linear:**
- Purpose: Linear API tool plugin
- Contains: LinearIntegration with tools for listing/creating issues
- Key files: `index.ts` (LinearIntegration class, Linear API client)

**packages/scheduler:**
- Purpose: Cron job scheduler
- Contains: Scheduler class using node-cron for task scheduling
- Key files: `index.ts` (Scheduler class, cron job management)

**packages/status-reporter:**
- Purpose: Periodic status updates about running agent sessions
- Contains: StatusReporter that polls sessions and broadcasts updates
- Key files: `index.ts` (StatusReporter class, interval-based polling)

**config/:**
- Purpose: Mode configuration (personal, work)
- Contains: JSON config files defining system prompts, model choices, channels, integrations, crons
- Key files: `personal.json`, `work.json`

## Key File Locations

**Entry Points:**
- `packages/cli/src/index.ts`: Main executable; loads config, initializes services, starts gateway

**Configuration:**
- `config/personal.json`: Personal mode definition (Telegram, Notion, Gmail)
- `config/work.json`: Work mode definition (Slack, Linear, Notion, Gmail)
- `.env`: Runtime secrets (API keys, bot tokens)
- `pnpm-workspace.yaml`: Workspace package listing

**Core Logic:**
- `packages/core/src/agent.ts`: Two-tier triage/delegation logic, tool execution
- `packages/core/src/llm.ts`: Anthropic, OpenAI, OpenRouter provider implementations
- `packages/core/src/types.ts`: Central type definitions (Channel, Integration, ToolDefinition, ModeConfig)
- `packages/gateway/src/index.ts`: Message routing and mode context binding

**Integration Plugins:**
- `packages/integrations/gmail/src/index.ts`: Gmail tools (list, read, send messages)
- `packages/integrations/notion/src/index.ts`: Notion tools (search, read page, create page)
- `packages/integrations/linear/src/index.ts`: Linear tools (list issues, create issue)

**Channel Adapters:**
- `packages/channels/telegram/src/index.ts`: Telegram polling and API client
- `packages/channels/slack/src/index.ts`: Slack event handling

**Utilities:**
- `packages/core/src/tmux.ts`: Tmux session/window management for agent isolation
- `packages/scheduler/src/index.ts`: Cron job scheduling and execution
- `packages/status-reporter/src/index.ts`: Session monitoring and broadcast

## Naming Conventions

**Files:**
- Implementation files: PascalCase class name in index.ts (e.g., `TelegramChannel` in `packages/channels/telegram/src/index.ts`)
- Type definitions: types.ts (e.g., `Channel`, `Integration`, `ModeConfig` in `packages/core/src/types.ts`)
- Public exports: index.ts re-exports classes and types

**Directories:**
- Package names: kebab-case (e.g., `status-reporter`, `channel-telegram`)
- NPM scoped names: `@jarvis/*` (e.g., `@jarvis/core`, `@jarvis/gateway`)
- Type/class names: PascalCase (e.g., `AgentOrchestrator`, `TelegramChannel`)

**Functions/Methods:**
- Event handlers: camelCase with "on" prefix (e.g., `onMessage`, `onProgress`)
- Getters/setters: camelCase (e.g., `getActiveMode()`, `switchMode()`)
- Private methods: camelCase with underscore prefix (e.g., `_handleCommand()`, `_delegateToSmart()`)
- Classes: PascalCase

**Variables/Constants:**
- Config objects: camelCase (e.g., `modeConfig`, `gatewaConfig`)
- Maps/collections: plural nouns (e.g., `sessions`, `modes`, `tools`, `channels`)
- Session/IDs: camelCase (e.g., `sessionId`, `windowName`)

## Where to Add New Code

**New Tool/Integration:**
- Location: `packages/integrations/{service-name}/src/index.ts`
- Pattern: Create class implementing `Integration` interface with `tools` array
- Each tool must have: name, description, JSON-schema parameters, async execute function
- Register in CLI: Add to integrations array in `packages/cli/src/index.ts` main()

**New Channel:**
- Location: `packages/channels/{platform-name}/src/index.ts`
- Pattern: Create class implementing `Channel` interface
- Required methods: initialize(), send(), sendPlaceholder(), editMessage(), shutdown()
- Register in CLI: Add conditional in `packages/cli/src/index.ts` to instantiate if config present

**New Command (built-in):**
- Location: `packages/core/src/agent.ts`, method `handleCommand()`
- Pattern: Add if/else branch checking trimmed text, return AgentResponse
- Example: `/mode`, `/sessions`, `/peek` are built-in commands here

**New Mode:**
- Location: `config/{mode-name}.json`
- Required fields: mode, systemPrompt, triage (model config), smart (model config), channels, integrations, statusInterval, crons
- Register in CLI: Automatically loaded from config directory by main()

**New Cron Job:**
- Location: `config/{mode-name}.json` → crons array
- Pattern: CronJobConfig object with name, schedule (cron expr), prompt, tier, mode
- No code needed; loaded by Scheduler at startup

**Unit/Utility Functions:**
- Location: Keep in same file as class that uses it
- If shared across packages: Add to `packages/core/src/types.ts` or create utility file in core

## Special Directories

**dist/:**
- Purpose: Compiled JavaScript output
- Generated: Yes (via `pnpm build`)
- Committed: No

**node_modules/:**
- Purpose: Installed dependencies
- Generated: Yes (via `pnpm install`)
- Committed: No

**pnpm-lock.yaml:**
- Purpose: Locked dependency versions for reproducible installs
- Generated: Yes (via `pnpm install` when dependencies change)
- Committed: Yes

**.env:**
- Purpose: Runtime environment variables (API keys, tokens, config)
- Generated: No (user creates from .env.example)
- Committed: No (gitignored for security)

---

*Structure analysis: 2026-02-05*
