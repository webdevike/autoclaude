# Technology Stack

**Analysis Date:** 2026-02-05

## Languages

**Primary:**
- TypeScript 5.4+ - All source code and build system
- JavaScript (ES2022) - Compiled output runtime

**Build Target:**
- NodeNext module resolution for ES modules

## Runtime

**Environment:**
- Node.js 22+ (specified in root `package.json`)

**Package Manager:**
- pnpm (with workspace support)
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks & Core Libraries

**LLM & AI:**
- `@ai-sdk/anthropic` 3.0.36 - Anthropic Claude integration via Vercel AI SDK
- `@ai-sdk/openai` 3.0.25 - OpenAI integration via Vercel AI SDK
- `@anthropic-ai/sdk` 0.39.0 - Direct Anthropic API client
- `openai` 4.78.0 - OpenAI direct client library (for compatibility)

**Messaging & Channels:**
- Manual fetch-based Telegram polling (no external library) - replaced grammY
- Telegram API via raw HTTP (fetch)

**Task Scheduling:**
- `node-cron` 3.0.3 - Cron job scheduling for automated tasks
- `@types/node-cron` 3.0.11 - TypeScript types for node-cron

**External Service SDKs:**
- `googleapis` 144.0.0 - Google Gmail API client
- `@notionhq/client` 2.2.0 - Notion API client
- `@linear/sdk` 28.0.0 - Linear issue tracking API client

**Utilities:**
- `dotenv` 16.4.0 - Environment variable loading

## Build & Development Tools

**TypeScript:**
- Version: 5.4.0 (dev dependency)
- Configuration: `tsconfig.json` with strict mode enabled
- Target: ES2022 with NodeNext module resolution

**Monorepo Management:**
- pnpm workspaces via `pnpm-workspace.yaml`
- Workspace packages: `packages/*`, `packages/channels/*`, `packages/integrations/*`

**Dev Dependencies:**
- `@types/node` 22.0.0 - Node.js type definitions
- `tsx` 4.19.0 - TypeScript execution for development (`dev` script)

## Architecture & Structure

**Monorepo Packages:**
- `@jarvis/core` - Core agent orchestration, LLM client, tmux management, type definitions
- `@jarvis/cli` - CLI entry point and application initialization
- `@jarvis/gateway` - Message routing and channel coordination
- `@jarvis/channel-telegram` - Telegram bot integration
- `@jarvis/integration-gmail` - Gmail API integration (tools)
- `@jarvis/integration-notion` - Notion API integration (tools)
- `@jarvis/integration-linear` - Linear API integration (tools)
- `@jarvis/scheduler` - Cron job scheduling and execution
- `@jarvis/status-reporter` - Session status monitoring and broadcasting

## Configuration & Environment

**Configuration Files:**
- `tsconfig.json` (root) - Base TypeScript configuration for all packages
- `.env.example` - Environment variables template
- `.env` (git-ignored) - Runtime secrets

**Environment Variables Required:**
```
OPENROUTER_API_KEY      # OpenRouter LLM provider (default)
OPENAI_API_KEY          # OpenAI fallback (optional)
ANTHROPIC_API_KEY       # Anthropic Claude API (optional)
TELEGRAM_BOT_TOKEN      # Telegram bot token
SLACK_BOT_TOKEN         # Slack bot (future)
SLACK_APP_TOKEN         # Slack app (future)
SLACK_SIGNING_SECRET    # Slack signing (future)
NOTION_API_KEY          # Notion API key
LINEAR_API_KEY          # Linear API key
GMAIL_CLIENT_ID         # Gmail OAuth2 client ID
GMAIL_CLIENT_SECRET     # Gmail OAuth2 secret
GMAIL_REFRESH_TOKEN     # Gmail OAuth2 refresh token
JARVIS_MODE             # Active mode: "personal" or "work" (default: "personal")
JARVIS_CONFIG_DIR       # Config directory path (default: ./config)
```

**Mode Configuration:**
- Loaded from `config/*.json` (e.g., `config/personal.json`, `config/work.json`)
- Contains: mode name, system prompt, triage/smart model configs, channels, integrations, cron jobs
- Structure defined in `packages/core/src/types.ts` - `ModeConfig` interface

## Containerization

**Docker:**
- Base image: `node:22-slim`
- Build: Multi-stage compile with `pnpm build`
- Runtime: Direct execution via `node packages/cli/dist/index.js`
- Volume mounts:
  - `./config/` → `/app/config:ro` (read-only configuration)
  - `jarvis-data` → `/app/data` (persistent data volume)
- Logging: JSON file driver with size limits (10m max, 3 files)

**Container Runtime:**
- `docker-compose.yml` with single jarvis service
- Restart policy: `unless-stopped`
- Environment: Loaded from `.env` file

## System Dependencies

**Required at Runtime:**
- tmux - Terminal multiplexer for managing smart agent sessions (`@jarvis/core` uses execSync to tmux)
- Node.js with pnpm (as per Dockerfile)

**Optional:**
- Slack (future integration support stubbed in env vars)

## External APIs & Services

**LLM Providers:**
- OpenRouter (primary, via custom fetch implementation) - `https://openrouter.ai/api/v1/chat/completions`
- OpenAI (fallback) - `https://api.openai.com/v1/chat/completions`
- Anthropic Claude (fallback) - Native SDK via `@anthropic-ai/sdk`

**Messaging:**
- Telegram Bot API - `https://api.telegram.org/bot{token}/` (polling-based via fetch)

**Content & Productivity:**
- Gmail API (via googleapis SDK) - OAuth2 with refresh tokens
- Notion API - Token-based auth
- Linear API - Token-based auth

## Dependencies Summary

**Critical:**
- `node` ≥22 - Runtime requirement
- `@ai-sdk/anthropic`, `@ai-sdk/openai` - LLM abstraction layer
- `@anthropic-ai/sdk`, `openai` - Direct provider clients
- `googleapis` - Gmail integration
- `@notionhq/client` - Notion integration
- `@linear/sdk` - Linear integration
- `node-cron` - Task scheduling

**Build:**
- `typescript` 5.4.0 - Type compilation
- `tsx` 4.19.0 - Development execution
- `@types/node`, `@types/node-cron` - Type definitions

**Infrastructure:**
- `dotenv` - Configuration loading

## Type System

**Module System:**
- ES modules (`"type": "module"` in all packages)
- TypeScript with strict mode enabled
- No CommonJS interop needed

**Declaration Files:**
- Generated to `dist/*.d.ts` for all packages
- Source maps included for debugging

---

*Stack analysis: 2026-02-05*
