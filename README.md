# Jarvis

Personal AI agent with multi-channel messaging, smart delegation, and integrations.

## Architecture

```
You (Telegram/Slack)
  │
  ▼
Gateway (routes messages, manages modes)
  │
  ▼
Triage Agent (cheap/fast model)
  │
  ├─ Simple request → responds directly
  │
  └─ Complex request → delegates to Smart Agent
                          │
                          ├─ Runs in tmux (you can peek anytime)
                          ├─ Has access to tools (Notion, Linear, Gmail)
                          └─ Sends status updates at intervals
```

## Modes

- **personal** — Telegram, casual tone, Notion + Gmail integrations
- **work** — Slack, professional tone, Linear + Notion + Gmail integrations

Switch with `/mode personal` or `/mode work` from any channel.

## Commands

| Command | Description |
|---|---|
| `/mode` | Show current mode |
| `/mode <name>` | Switch mode |
| `/sessions` | List running smart agent sessions |
| `/peek` | List active tmux windows |
| `/peek <id>` | View output from a smart agent session |

## Setup

1. Copy `.env.example` to `.env` and fill in your API keys
2. Install dependencies: `pnpm install`
3. Build: `pnpm build`
4. Run: `pnpm start`

## Deploy to VPS

```bash
docker compose up -d
```

## Cron Jobs

Add cron jobs to your mode config files in `config/`:

```json
{
  "crons": [
    {
      "name": "morning-briefing",
      "schedule": "0 9 * * *",
      "prompt": "Give me a summary of unread emails and open Linear issues",
      "tier": "smart",
      "mode": "work"
    }
  ]
}
```

## Project Structure

```
packages/
  core/              Agent runtime, LLM client, tmux manager
  gateway/           Message routing, mode switching
  channels/
    telegram/        Telegram bot (grammY)
    slack/           Slack bot (Bolt)
  integrations/
    notion/          Notion API (search, read, create pages)
    linear/          Linear API (issues, teams)
    gmail/           Gmail API (read, send emails)
  scheduler/         Cron job engine
  status-reporter/   Interval status updates
  cli/               Main entrypoint
config/
  personal.json      Personal mode config
  work.json          Work mode config
```
