# External Integrations

**Analysis Date:** 2026-02-05

## APIs & External Services

**Messaging Channels:**
- **Telegram** - Chat bot communication and polling
  - SDK/Client: Manual fetch-based HTTP polling (no external package)
  - Auth: `TELEGRAM_BOT_TOKEN` (bot token only, no OAuth)
  - Implementation: `packages/channels/telegram/src/index.ts` - `TelegramChannel` class
  - API Endpoint: `https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/`
  - Methods: `getMe`, `getUpdates`, `sendMessage`, `sendChatAction`, `editMessageText`

**Productivity & Task Management:**
- **Notion** - Page/database management for task tracking
  - SDK/Client: `@notionhq/client` 2.2.0
  - Auth: `NOTION_API_KEY` (bearer token)
  - Implementation: `packages/integrations/notion/src/index.ts` - `NotionIntegration` class
  - Tools provided:
    - `notion_search` - Search pages and databases by query
    - `notion_read_page` - Read page content blocks
    - `notion_create_page` - Create new pages in databases

- **Linear** - Issue/project tracking
  - SDK/Client: `@linear/sdk` 28.0.0
  - Auth: `LINEAR_API_KEY` (API token)
  - Implementation: `packages/integrations/linear/src/index.ts` - `LinearIntegration` class
  - Tools provided:
    - `linear_search_issues` - Search issues by query
    - `linear_create_issue` - Create new issues in teams
    - `linear_list_teams` - List all teams in workspace
    - `linear_my_issues` - List issues assigned to current user

- **Gmail** - Email management via Google API
  - SDK/Client: `googleapis` 144.0.0 (Google client library)
  - Auth: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (OAuth2)
  - Implementation: `packages/integrations/gmail/src/index.ts` - `GmailIntegration` class
  - Authentication flow: OAuth2 with refresh token (`google.auth.OAuth2`)
  - Tools provided:
    - `gmail_list_messages` - List recent/filtered messages
    - `gmail_read_message` - Read full message content by ID
    - `gmail_send` - Send email via Gmail
  - User: Always uses "me" (authenticated user's account)

## Data Storage

**Databases:**
- No persistent database integration (SQL/NoSQL)
- File-based configuration only: JSON mode files in `./config/` directory

**File Storage:**
- Local filesystem only
- Docker volume: `jarvis-data` → `/app/data`
- Configuration files: `./config/*.json` (mounted as read-only)

**In-Memory State:**
- `AgentOrchestrator` maintains session map in memory (`packages/core/src/agent.ts`)
- Telegram chat ID mapping (`chatIdMap`) in `packages/channels/telegram/src/index.ts`
- Scheduler job registry in `packages/scheduler/src/index.ts`

**Caching:**
- None detected - no external cache service (Redis, Memcached)
- Session state ephemeral, lost on restart

## Authentication & Identity

**Auth Method:**
- **Multi-provider (mixed):**
  - **OpenRouter**: Bearer token via `OPENROUTER_API_KEY`
  - **OpenAI**: Bearer token via `OPENAI_API_KEY`
  - **Anthropic**: Bearer token via `ANTHROPIC_API_KEY`
  - **Telegram**: Bot token only (no user auth, admin-configured)
  - **Notion**: Bearer token via `NOTION_API_KEY`
  - **Linear**: API token via `LINEAR_API_KEY`
  - **Gmail**: OAuth2 with refresh token (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`)

**Authorization:**
- Telegram: Optional allowlist via `TELEGRAM_ALLOWED_USERS` comma-separated string
- All APIs: Bearer/token-based, no per-message authentication
- Gmail: Implicit (acts as authenticated user via refresh token)

**Session Management:**
- No user sessions tracked
- Agent sessions tracked in-memory by `AgentOrchestrator.sessions` map
- Session ID: UUID (first 8 chars)

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, DataDog, etc.)
- All errors logged to stdout/stderr via `console.error()` and `console.warn()`

**Logging:**
- Framework: Node.js `console` (native)
- Patterns observed:
  - `[component-name]` prefix for all log messages (e.g., `[telegram]`, `[gateway]`, `[scheduler]`)
  - Error messages include retry attempts and provider names
  - OpenRouter responses logged with status and byte length for debugging

**Status Reporting:**
- `@jarvis/status-reporter` sends periodic updates through channels
- Interval configurable per mode (via `ModeConfig.statusInterval`)
- Listens to orchestrator status events
- Broadcast endpoint via `channel.send("broadcast", text)`

## CI/CD & Deployment

**Hosting:**
- Self-hosted via Docker or direct Node.js execution
- Containerized: `docker-compose.yml` with `Dockerfile`
- No cloud platform integration detected

**CI Pipeline:**
- None detected (no GitHub Actions, GitLab CI, etc.)
- Build via: `pnpm build` (runs tsc in all packages)
- Manual deployment

**Build Steps:**
1. Install dependencies: `pnpm install --frozen-lockfile`
2. Build packages: `pnpm build` (TypeScript compilation)
3. Run: `node packages/cli/dist/index.js`

## Webhooks & Callbacks

**Incoming:**
- **Telegram**: Polling-based (no webhooks)
  - Implementation: `TelegramChannel.poll()` - 2-second polling interval with 5-second timeout
  - Updates fetched via `getUpdates` with offset tracking

**Outgoing:**
- **Email**: No outbound webhooks detected
- **Notion/Linear**: Integration tools are read-only queries, no subscription webhooks
- **Status broadcasts**: Outbound via configured channels (Telegram, future Slack)

## Message Flow & Tool Execution

**Agent → Tool → External Service:**
1. `AgentOrchestrator.handleMessage()` triages incoming request
2. If delegation needed, `AgentOrchestrator.delegateToSmart()` loops:
   - Calls LLM (OpenRouter/OpenAI/Anthropic) with available tools
   - LLM returns tool calls
   - Tools executed via `ToolDefinition.execute(params)`
   - Results sent back to LLM in message loop
3. Loop repeats until no tool calls (max 20 turns)

**Tools Registered Per Mode:**
- Defined in `packages/cli/src/index.ts` - initialized integrations' tools registered globally
- Accessible to all modes unless filtered

## Rate Limiting & Quotas

**Detected Mechanisms:**
- OpenRouter: No explicit rate limit handling
- Telegram: No rate limit handling in polling (sets 5s timeout)
- Gmail: No explicit rate limit handling
- Notion: No explicit rate limit handling
- Linear: No explicit rate limit handling

**Retry Logic:**
- OpenRouter chat: 2 retries with exponential backoff (1s, 2s)
- Telegram API: 2 retries with exponential backoff (1s, 2s)
- LLM client catches transient errors: `ECONNRESET`, `fetch failed`, `Unexpected end of JSON`

## Environment & Secrets

**Secret Variables:**
- All API keys and tokens stored in `.env` (git-ignored)
- Loaded via `dotenv` in `packages/cli/src/index.ts`
- No secret manager integration detected

**Configuration Priority:**
1. Environment variables (`.env`)
2. Integration config objects (passed to `initialize()`)
3. Defaults in code (e.g., config directory)

**Required for Full Operation:**
```
OPENROUTER_API_KEY  # Primary LLM provider
NOTION_API_KEY      # Notion integration
LINEAR_API_KEY      # Linear integration
GMAIL_*             # Gmail (OAuth2 triple)
TELEGRAM_BOT_TOKEN  # Telegram channel
```

**Optional:**
```
OPENAI_API_KEY      # Fallback LLM
ANTHROPIC_API_KEY   # Fallback LLM
TELEGRAM_ALLOWED_USERS  # User allowlist
```

## Graceful Degradation

**If credentials missing:**
- Integrations log warning and disable gracefully (`initialize()` returns early)
- Tools from disabled integration not available to agents
- Gateway/channels degrade individually (e.g., Telegram logs warning but other channels start)
- Application continues if at least one mode and one channel can initialize

**Example:** No `TELEGRAM_BOT_TOKEN` → Telegram disabled with warning, other channels active

---

*Integration audit: 2026-02-05*
