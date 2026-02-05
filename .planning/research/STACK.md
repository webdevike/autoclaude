# Technology Stack: Jarvis Personal AI Assistant

**Project:** Jarvis (self-hosted personal AI assistant with two-tier model delegation)
**Researched:** 2026-02-05
**Overall Confidence:** HIGH

## Executive Summary

The 2025/2026 standard stack for self-hosted personal AI assistants with two-tier model delegation centers on **TypeScript monorepos with pnpm**, **pi-mono packages** for LLM abstraction and agent runtime, **multi-provider LLM access** (OpenRouter as aggregator with direct fallbacks), and **lightweight persistence** (JSON files + optional SQLite). The ecosystem has matured significantly with tools like pi-ai providing unified LLM APIs, pi-agent-core handling agent loops with tool execution, and established integration SDKs for all major services (Gmail, Linear, Notion, Telegram).

**Key insight:** The pi-mono packages represent the current best practice for building coding-first AI assistants in TypeScript. They prioritize transparency, minimal abstraction, and developer control over feature bloat. The Jarvis migration path is clear: adopt pi-ai for LLM layer, pi-agent-core for agent runtime, and optionally pi-coding-agent as a delegation target for coding tasks.

---

## Recommended Stack

### Core Framework & Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Node.js** | 22+ (LTS) | Runtime environment | Node 22.6.0+ includes native TypeScript support via --experimental-strip-types, major performance improvements with module.enableCompileCache() making tsc 2-3x faster, and is required for @linear/sdk. Node 23.6.0 made TypeScript support stable (no longer experimental). |
| **TypeScript** | 5.6+ | Type safety & DX | TS 5.6+ includes --noCheck flag for faster compilation, TS 5.8 adds stable --module node18 and --erasableSyntaxOnly for stricter checks. Use strict mode with tsconfig.base.json across monorepo. |
| **pnpm** | 9.x | Package manager | Industry standard for TypeScript monorepos in 2026. Strict dependency graphs catch undeclared imports early, workspace protocol (workspace:*) prevents version drift, significantly faster installs than npm, and better for AI agent development per community best practices. |

**Confidence:** HIGH — These are stable, well-documented choices with clear migration paths.

---

### LLM Layer & Agent Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **@mariozechner/pi-ai** | 0.48.0+ | Unified LLM API | Multi-provider abstraction (20+ providers: Anthropic, OpenAI, Google, Mistral, GitHub Copilot, Bedrock, OpenRouter, Groq, Cerebras, xAI, etc.), streaming support, tool calling with TypeBox schemas, cross-provider context handoff mid-session, thinking/reasoning support, token and cost tracking, AbortController throughout pipeline. Built specifically for agent use cases. Replaces your custom LLMClient. **This is the 2026 standard for TypeScript AI apps.** |
| **@mariozechner/pi-agent-core** | 0.48.0+ | Agent loop runtime | Event-driven agent loop with tool execution, validation, and event streaming. Provides Agent class with state management, simplified event subscriptions, message queuing (one-at-a-time or all-at-once modes), attachment handling (images, documents), and transport abstraction (direct or proxy). Replaces your custom AgentOrchestrator. **Proven production-ready architecture.** |
| **@mariozechner/pi-coding-agent** | 0.48.0+ (optional) | Smart coding delegate | Interactive TUI-based coding assistant with three modes: TUI (interactive sessions), RPC (programmatic control), print mode (batch processing). Can be invoked as a subprocess for complex coding tasks. Includes session management, custom tools, themes, and AGENTS.md project context. **Consider as delegation target for smart tier coding tasks.** |

**Rationale:** pi-mono packages embody 2026 best practices for AI agent development: radical minimalism, transparency over magic, developer control, and minimal token overhead. Mario Zechner's design philosophy prioritizes what works in practice over theoretical completeness. The packages are battle-tested, actively maintained (141 releases, 7000+ stars), and designed to be composed rather than forked.

**Alternative considered:** Vercel AI SDK (ai package) — Excellent for web applications with React hooks (useChat, useCompletion), but heavier weight and optimized for Next.js workflows rather than standalone agent runtimes. AI SDK 6 adds ToolLoopAgent with human-in-the-loop control and programmatic tool calling. Use Vercel AI SDK if building web UI, use pi-ai for backend agents. **Confidence: HIGH**

---

### LLM Providers & Model Selection

| Provider | Model Tier | Cost (per 1M tokens) | Purpose | Why |
|----------|-----------|----------------------|---------|-----|
| **OpenRouter** | Aggregator | Claude Sonnet 4.5: $3 input / $15 output<br>GPT-5: $1.25 input / $10 output | Primary gateway with 300+ models, intelligent routing, automatic failovers | Zero Completion Insurance (billing only for successful runs), unified API reduces integration surface, prompt caching support, standardized request format. **Use as default provider with direct fallbacks.** |
| **Anthropic (direct)** | Smart tier | Claude Sonnet 4.5: $3 input / $15 output<br>Claude Haiku: $0.25 input / $1.25 output | Direct fallback for Claude models | Lower cost than OpenRouter markup (though marginal), more reliable API during high load, native prompt caching (50% discount on cached tokens), thinking/reasoning support. **Use for production workloads after testing via OpenRouter.** |
| **OpenAI (direct)** | Smart tier | GPT-4.5 Turbo: prices vary<br>GPT-o1: varies | Fallback for OpenAI models | Direct access avoids OpenRouter markup, batch API offers 50% discount with 24hr turnaround (useful for non-realtime tasks like summarization), function calling remains robust. **Use sparingly; Claude is better for most agent tasks in 2026.** |

**Two-tier delegation strategy:**
- **Triage tier:** Claude Haiku via OpenRouter ($0.25/$1.25 per 1M tokens) — handles greetings, status checks, simple commands, delegation decisions
- **Smart tier:** Claude Sonnet 4.5 via OpenRouter initially, migrate to direct Anthropic API for production ($3/$15 per 1M tokens) — complex reasoning, coding, integrations, multi-step planning

**Cost optimization:** 80-95% of calls run on cheaper models with escalation only for hard cases. Prompt caching reduces redundant API calls. Output tokens cost 3-10x input tokens (critical factor often overlooked).

**Confidence:** HIGH — This multi-provider approach with OpenRouter as aggregator and direct provider fallbacks is the 2026 industry standard.

---

### Message Channels & Integrations

| Technology | Version | Purpose | Why | Notes |
|------------|---------|---------|-----|-------|
| **Telegram Bot API** | Latest (fetch-based polling) | Primary messaging interface | Manual fetch-based long polling (no grammY dependency) is simpler, works in development without public URL/domain, easier to debug than webhooks. **Long polling is the right choice for self-hosted personal assistants.** | Migrate to webhooks only if scaling beyond single-user or deploying behind reverse proxy. |
| **@googleapis/gmail** | Latest | Gmail integration | Official Google Node.js client, OAuth 2.0 support, Pub/Sub webhook support for realtime mail, well-maintained. Use with GCP project for OAuth credentials. | Store refresh token in secure location (env file or DB), use read-only scope by default, enable modify scope only when needed. |
| **@linear/sdk** | Latest (requires Node 18+) | Linear integration | Official Linear TypeScript SDK with strongly-typed GraphQL models, ships with types out of the box, Node 18+ with Corepack required. Use API keys or OAuth 2.0. | Use pagination/filtering for large datasets, prefer webhooks over polling for realtime updates. |
| **@notionhq/client** | Latest | Notion integration | Official Notion JavaScript SDK (npm: @notionhq/client), simplifies REST API interactions, convenient authentication handling. Generate internal integration token from Notion workspace. | Use databases.query for retrieving data, each page = database row. Good for storing preferences/memory. |
| **Exa** | Latest (REST API) | Web search for AI agents | Exa provides realtime, intelligent web search designed for AI agents. MCP support available, /research endpoint for agentic search with structured outputs, OpenAI-compatible async-first endpoint. LangChain/LlamaIndex integrations available. | Consider for web research tasks. Alternative: Perplexity API, Brave Search API. |

**Architecture pattern:** All integrations expose as **tool definitions** registered with AgentOrchestrator. Tools should be idempotent where possible, validate inputs, and return structured results (JSON) that the LLM can reason about.

**Confidence:** HIGH — All are official/well-maintained SDKs with clear documentation.

---

### Persistence & Memory

| Approach | Technology | Purpose | Why | When to Use |
|----------|-----------|---------|-----|-------------|
| **JSON files** | Node.js fs | Mode configs, user preferences, settings | Zero dependencies, human-readable, easy to edit manually, version control friendly, perfect for small structured data. **This is what you already have.** | Personal assistant with single user, < 10k records, data that benefits from manual inspection/editing. |
| **SQLite** | better-sqlite3 (if needed) | Conversation history, memory, session logs | Lightweight (single file), zero configuration, ACID transactions, efficient querying, portable, works offline. Popular for AI agent memory (LangChain's SqliteSaver, MCP memory plugins, Clawdbot memory system). | When conversation history grows large (>1000 messages), when you need full-text search, when querying by date/user/session. **Don't add until JSON becomes painful.** |
| **Vector DB** | Optional (sqlite-vec, Chroma, Pinecone) | Semantic memory search, RAG | Enable similarity search over memories, conversation history, or document embeddings. Sqlite-vec provides hardware-accelerated vector search in SQLite. | Only if building RAG features or semantic memory. **Defer unless explicitly needed.** |

**Recommendation:** Start with JSON files (current approach is correct), migrate to SQLite when conversation history or memory grows beyond ~1000 entries or when you need time-based queries. Vector DB is optional future enhancement.

**Memory patterns (2026 best practices):**
- **MCP Memory Service** pattern: Auto-capture project context, architecture decisions, code patterns across sessions
- **AgentKits Memory** pattern: 100% local, blazing fast, zero config persistent memory
- **Stevens pattern** (Geoffrey Litt): Single SQLite table + cron jobs for ingesting memories and sending updates

**Confidence:** HIGH — JSON for now, SQLite migration path is well-trodden.

---

### Deployment & Operations

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **systemd** | Native (Linux) | Service management | Native service manager for Linux, integrated into init process, better control over service lifecycle and resource management than tmux/PM2. **This is the 2026 standard for VPS Node.js deployments.** Platform-specific alternatives: macOS LaunchAgent, Windows WSL2 systemd, Raspberry Pi systemd. |
| **tmux** | Latest | Development/debugging only | Keep sessions alive during SSH drops, useful for manual testing and debugging. **NOT for production.** Use systemd for actual deployment. |
| **Docker** (optional) | Latest | Containerization | Useful for multi-service deployments (gateway + workers), environment isolation, easier dependency management. LangGraph supports single-action deployment with persistent memory, horizontal scaling, and multi-agent workflows. | Use if deploying multiple related services or need strict environment isolation. Otherwise systemd is simpler. |
| **Nginx** (optional) | Latest | Reverse proxy | Required if exposing HTTP endpoints (webhooks, web UI), provides SSL termination, load balancing if scaling. Not needed for Telegram polling or CLI-only usage. | Add when transitioning to webhooks or adding web interface. |

**Deployment pattern for VPS:**
1. systemd user service (e.g., `jarvis-gateway.service`)
2. Environment variables via systemd EnvironmentFile or .env
3. Auto-restart on failure (Restart=always)
4. Logs via journalctl
5. Git deploy workflow: pull, build, restart service

**Confidence:** HIGH — systemd is the clear winner over tmux/PM2 for production in 2026.

---

### Development Tools & Quality Gates

| Tool | Version | Purpose | Configuration |
|------|---------|---------|---------------|
| **tsx** | Latest | TypeScript execution for dev | Fast TS runner for development (npm scripts: "dev": "tsx src/index.ts"). Production uses compiled JS. |
| **ESLint** | 9.x | Linting | Enforce consistent patterns, catch common footguns. **Gate on CI.** Use @typescript-eslint/eslint-plugin for TypeScript rules. |
| **Prettier** | Latest | Code formatting | Keep diffs readable, reduce bikeshedding. **Gate on format:check in CI.** |
| **TypeScript strict mode** | — | Type safety | "strict": true in tsconfig.base.json eliminates entire class of "looks right" mistakes. **Gate on CI.** |
| **AGENTS.md** | — | AI agent context | Project-specific rules and boundaries at monorepo root. Saves hours of manual prompting about installation/setup. OpenAI format widely adopted. **Critical for AI-assisted development.** |

**Quality protocol:**
- TypeScript type-check: hard gate locally and in CI
- ESLint: hard gate in CI
- Prettier: gate on format:check in CI
- All tests pass before deployment
- AGENTS.md documents project rules, not just tools

**Confidence:** HIGH — These are table stakes for professional TypeScript development in 2026.

---

## Alternatives Considered & Why Not

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| **LLM abstraction** | pi-ai | Vercel AI SDK | Vercel AI SDK is optimized for Next.js/React (useChat hooks, streaming UI), heavier bundle (129KB vs 19.5KB for single provider), better for web apps than standalone agents. Use Vercel AI SDK if building web UI. |
| **LLM abstraction** | pi-ai | LangChain | Heavy, complex, rapid breaking changes, excessive abstraction layers, not TypeScript-first. LangChain is better for Python ecosystems or when you need their specific ecosystem integrations. |
| **LLM abstraction** | pi-ai | Native SDKs (@anthropic-ai/sdk, openai) | Provider lock-in, manual retry logic, no cross-provider context handoff, tool calling schema validation is manual. Use native SDKs only if single provider and want minimal abstraction. **Note: Your current approach is acceptable but pi-ai is better.** |
| **Agent runtime** | pi-agent-core | Custom (your AgentOrchestrator) | Your implementation is solid but lacks event streaming, attachment handling, transport abstraction, and battle-tested error handling. Migration to pi-agent-core is incremental. |
| **Package manager** | pnpm | npm | npm lacks strict dependency graphs (undeclared imports fail silently), slower installs, workspace support is less mature. pnpm is industry standard for monorepos in 2026. |
| **Package manager** | pnpm | yarn | yarn v3+ (berry) has controversial PnP mode, smaller ecosystem, less adoption than pnpm in 2026. yarn v1 is deprecated. |
| **Telegram** | Manual fetch polling | grammY framework | You removed grammY (good decision) — frameworks add complexity for single-user bots, manual polling is simpler, easier to debug, no dependency bloat. Use grammY only for complex multi-user bots with scenes/keyboards. |
| **Deployment** | systemd | PM2 | PM2 adds Node.js dependency, less integrated than systemd, overkill for single-service deployment. Use PM2 only if managing many Node apps or need zero-downtime reloads. |
| **Deployment** | systemd | tmux | tmux is not a service manager, no auto-restart, no logging integration, manual session management. **Only for development.** |
| **Memory** | JSON → SQLite | PostgreSQL | Overkill for single-user assistant, requires separate server process, more complex backups. Use only if scaling to multi-user or need advanced queries. |
| **Memory** | JSON → SQLite | Redis | In-memory (not persistent by default), requires separate server, overkill for personal assistant. Use only if building realtime multi-user system. |

**Key principle:** Choose boring, well-understood technology. Avoid frameworks with excessive magic. Prefer composition over inheritance. The pi-mono philosophy embodies this.

---

## Installation & Setup

### Core Dependencies

```bash
# Already using pnpm — continue with this
pnpm --version  # Should be 9.x

# Add pi-mono packages to @jarvis/core
cd packages/core
pnpm add @mariozechner/pi-ai @mariozechner/pi-agent-core

# Optional: Add pi-coding-agent if using as delegation target
# (Install globally or as workspace package)
pnpm add -g @mariozechner/pi-coding-agent
# OR add to a dedicated package
```

### Integration SDKs

```bash
# Gmail integration
pnpm add @googleapis/gmail

# Linear integration (requires Node 18+, you have 22+)
pnpm add @linear/sdk

# Notion integration
pnpm add @notionhq/client

# Optional: SQLite (defer until needed)
# pnpm add better-sqlite3
```

### Development Dependencies

```bash
# Root workspace (if not already present)
pnpm add -D -w eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin

# Already have tsx and typescript — keep using those
```

---

## Migration Strategy: Existing Jarvis → pi-mono

Your current codebase is well-structured. Migration path:

### Phase 1: Adopt pi-ai (LLM Layer)
**Current:** Custom `LLMClient` class with Anthropic/OpenAI/OpenRouter support
**Target:** `@mariozechner/pi-ai`

**Benefits:**
- Remove custom provider abstraction code
- Gain 20+ provider support (Groq, Cerebras, xAI, Bedrock, etc.)
- Cross-provider context handoff
- Built-in token tracking and cost calculation
- TypeBox schema validation for tool calls

**Migration:**
1. Install pi-ai
2. Replace LLMClient instantiation with pi-ai's model imports
3. Update chat() method calls to use pi-ai's API
4. Remove custom retry logic (pi-ai handles this)
5. Update tool schemas to TypeBox format (or keep JSON Schema, pi-ai supports both)

**Effort:** Medium (2-3 days) — API is similar, mostly mechanical changes

### Phase 2: Adopt pi-agent-core (Agent Runtime)
**Current:** Custom `AgentOrchestrator` class with session management, tool execution
**Target:** `@mariozechner/pi-agent-core` Agent class

**Benefits:**
- Event streaming (onText, onToolCall, onComplete)
- Message queuing modes (sequential vs parallel)
- Attachment handling (images, PDFs)
- Transport abstraction (direct vs proxy)
- Battle-tested error handling

**Migration:**
1. Install pi-agent-core
2. Refactor AgentOrchestrator to wrap pi-agent-core's Agent class
3. Convert tool definitions to pi-agent-core format
4. Update message handling to use Agent.prompt()
5. Migrate status updates to event subscriptions
6. Keep your existing session tracking, mode switching, and delegation logic

**Effort:** Medium-High (3-5 days) — Requires careful state management migration

### Phase 3: Integrate pi-coding-agent (Optional Smart Delegate)
**Current:** Smart agent runs in-process with tool calls
**Target:** Delegate complex coding tasks to pi-coding-agent subprocess

**Benefits:**
- Proven coding agent with 20-turn loops, smart retries
- TUI/RPC/print modes for different use cases
- Session management, themes, AGENTS.md context
- Can invoke via bash tool or RPC

**Migration:**
1. Install pi-coding-agent globally or as workspace package
2. Add tool definition for invoking pi (e.g., "run_coding_task")
3. Serialize task to pi via bash or RPC mode
4. Parse pi's output and return to user
5. Keep existing smart agent for non-coding tasks

**Effort:** Low-Medium (1-2 days) — Mostly integration work

### Phase 4: Deployment with systemd
**Current:** Likely manual start or tmux
**Target:** systemd user service

**Migration:**
1. Create systemd service file (jarvis-gateway.service)
2. Configure EnvironmentFile for secrets
3. Set up auto-restart, logging
4. Test start/stop/restart commands
5. Document deployment process

**Effort:** Low (1 day)

**Total migration effort:** 1-2 weeks part-time, or 3-5 days full-time

**Risk assessment:** LOW — pi-mono packages are stable, migration is incremental, you can keep existing code as fallback.

---

## What NOT to Add (Anti-Patterns)

Based on 2026 best practices and pi-mono philosophy:

1. **DON'T add MCP (Model Context Protocol) support** — 15k token overhead for unused tools, complexity burden, better to use simple CLI tools with README docs. MCP is useful for specific scenarios (Claude Desktop integrations) but overkill for custom agents.

2. **DON'T add built-in to-do tracking** — Confuses models, adds state tracking burden. Write to external TODO.md file instead. Let tools be tools, not state machines.

3. **DON'T add "plan mode"** — Poor observability in Claude Code-style harnesses, agents miss context. Use collaborative file-based planning (agent writes PLAN.md, user reviews).

4. **DON'T add background bash execution** — Complex process tracking, poor visibility. Use tmux for manual sessions, or spawn visible subprocesses. Transparency over magic.

5. **DON'T add sub-agents as black boxes** — Limited context transfer, no visibility. Spawn pi via bash when needed, or use RPC mode with clear output.

6. **DON'T add vector DB prematurely** — Most personal assistants don't need semantic search. JSON files + SQLite full-text search handle 99% of cases.

7. **DON'T add Kubernetes, Redis, RabbitMQ** — You're building a personal assistant, not a FAANG-scale system. systemd + SQLite + JSON files are sufficient.

8. **DON'T add complex observability (Datadog, Prometheus)** — Use journalctl for logs, SQLite for metrics, JSON files for debugging. Simple > complex.

**Guiding principle:** "If I don't need it, it won't be built." (Mario Zechner, pi-coding-agent creator)

---

## Version Compatibility Matrix

| Technology | Minimum Version | Recommended | Notes |
|------------|----------------|-------------|-------|
| Node.js | 22.6.0 | 22.x LTS (latest) | Native TS support in 22.6.0+, stable in 23.6.0+. Use 22.x LTS for production. |
| TypeScript | 5.4.0 | 5.6+ | --noCheck flag in 5.6+, --erasableSyntaxOnly in 5.8 |
| pnpm | 9.0.0 | 9.x latest | |
| @mariozechner/pi-ai | 0.48.0 | Latest (0.50.x) | Monorepo uses lockstep versioning |
| @mariozechner/pi-agent-core | 0.48.0 | Latest (0.50.x) | |
| @mariozechner/pi-coding-agent | 0.48.0 | Latest (0.50.x) | Optional |
| @linear/sdk | — | Latest | Requires Node 18+ (you have 22+) |
| @notionhq/client | — | Latest | |
| @googleapis/gmail | — | Latest | |

**Compatibility:** All recommended packages work together. No known conflicts.

---

## Cost Analysis (Two-Tier Delegation)

**Assumptions:** Personal assistant, ~100 messages/day, 80% triage, 20% smart delegation

| Tier | Model | Input (1M tokens) | Output (1M tokens) | Daily Usage | Monthly Cost |
|------|-------|-------------------|-------------------|-------------|--------------|
| Triage | Claude Haiku (OpenRouter) | $0.25 | $1.25 | 80 requests × 500 input + 100 output tokens avg | $0.012 input + $0.010 output = **$0.022/day** |
| Smart | Claude Sonnet 4.5 (OpenRouter) | $3.00 | $15.00 | 20 requests × 2000 input + 500 output tokens avg | $0.120 input + $0.150 output = **$0.27/day** |
| **Total** | | | | | **~$8.76/month** |

**With prompt caching (50% discount on cached tokens):** Reduce by 30-40% = **~$5-6/month**

**Comparison:**
- ChatGPT Plus: $20/month (no API access, no custom tools)
- Claude Pro: $20/month (no API access, no custom tools)
- Cursor Pro: $20/month (coding only)
- **Jarvis with two-tier delegation: $5-9/month** (full control, custom integrations, self-hosted)

**Confidence:** HIGH — Two-tier delegation provides excellent cost efficiency for personal use.

---

## Security Considerations

**API Keys:**
- Store in .env file (gitignored), or systemd EnvironmentFile
- Use separate keys per environment (dev/prod)
- Rotate keys periodically

**OAuth Tokens:**
- Store Gmail/Linear/Notion refresh tokens securely
- Use read-only scopes by default
- Enable modify scopes only when needed

**Agent Safety:**
- pi operates in "YOLO mode" (unrestricted filesystem/command access)
- This is pragmatic: once agent can write code + execute, preventing data exfiltration is impossible
- For sensitive environments: run in Docker container with volume mounts
- Alternative: use needsApproval: true for destructive tools

**Network:**
- VPS deployment: use SSH key auth, disable password login
- If exposing HTTP: use Nginx with SSL (Let's Encrypt)
- Telegram bot token should be treated as secret

**Confidence:** MEDIUM — Security is "good enough" for personal use, but not enterprise-grade.

---

## Observability & Debugging

**Logging:**
- Use console.log for development (redirected by tsx)
- Use journalctl for systemd services in production
- Log LLM requests/responses to files for debugging (optional, watch token costs)

**Metrics:**
- Track token usage per model/provider (pi-ai provides this)
- Track tool execution time
- Store in JSON files or SQLite

**Debugging:**
- TypeScript source maps (tsconfig: "sourceMap": true)
- tsx for development (faster than tsc --watch)
- tmux for manual testing sessions
- pi-coding-agent TUI mode for inspecting coding tasks

**Session inspection:**
- pi-coding-agent sessions are JSON files — easy to inspect
- Your existing /sessions, /peek commands are good patterns

**Confidence:** HIGH — Simple observability is best for personal projects.

---

## Confidence Assessment by Category

| Category | Confidence | Rationale |
|----------|-----------|-----------|
| **Core runtime (Node.js, TypeScript, pnpm)** | HIGH | Stable, well-documented, industry standard for TypeScript monorepos |
| **LLM layer (pi-ai)** | HIGH | Battle-tested (7000+ stars, 141 releases), active maintenance, designed for agents |
| **Agent runtime (pi-agent-core)** | HIGH | Proven architecture, event-driven design, transport abstraction |
| **LLM providers (OpenRouter + direct)** | HIGH | Standard 2026 pattern, multiple sources confirm |
| **Integrations (Gmail, Linear, Notion)** | HIGH | Official SDKs, well-documented |
| **Telegram polling** | HIGH | Your current approach (manual fetch) is correct for single-user bot |
| **Deployment (systemd)** | HIGH | Standard for VPS Node.js deployments in 2026 |
| **Persistence (JSON → SQLite)** | HIGH | Well-trodden path, clear migration point |
| **Cost estimates** | MEDIUM | Based on typical usage, actual costs depend on prompt size and frequency |
| **Security** | MEDIUM | Good for personal use, not enterprise-grade |

**Overall confidence: HIGH** — This stack is well-validated by industry practice and multiple authoritative sources.

---

## Sources & Further Reading

**pi-mono ecosystem:**
- [GitHub - badlogic/pi-mono](https://github.com/badlogic/pi-mono)
- [What I learned building an opinionated and minimal coding agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)
- [@mariozechner/pi-ai on npm](https://www.npmjs.com/package/@mariozechner/pi-ai)
- [@mariozechner/pi-agent-core on npm](https://www.npmjs.com/package/@mariozechner/pi-agent-core)

**LLM providers & cost:**
- [Complete LLM Pricing Comparison 2026](https://www.cloudidr.com/blog/llm-pricing-comparison-2026)
- [Choosing an LLM in 2026: The Practical Comparison Table](https://dev.to/superorange0707/choosing-an-llm-in-2026-the-practical-comparison-table-specs-cost-latency-compatibility-354g)
- [OpenRouter](https://openrouter.ai/)
- [OpenRouter Pricing](https://openrouter.ai/pricing)

**Vercel AI SDK:**
- [AI SDK 6 announcement](https://vercel.com/blog/ai-sdk-6)
- [AI SDK documentation](https://ai-sdk.dev/docs/introduction)
- [OpenAI SDK vs Vercel AI SDK: Which Should You Choose in 2026](https://strapi.io/blog/openai-sdk-vs-vercel-ai-sdk-comparison)

**Memory & persistence:**
- [GitHub - doobidoo/mcp-memory-service](https://github.com/doobidoo/mcp-memory-service)
- [AgentKits Memory](https://www.agentkits.net/memory)
- [How Clawdbot Remembers: A Deep Dive into AI Agent Memory Architecture](https://avasdream.com/blog/clawdbot-memory-system-deep-dive)
- [Stevens: a hackable AI assistant using a single SQLite table](https://www.geoffreylitt.com/2025/04/12/how-i-made-a-useful-ai-assistant-with-one-sqlite-table-and-a-handful-of-cron-jobs)

**TypeScript monorepo best practices:**
- [Back to basics: solid foundation for using AI coding agents in a monorepo](https://dev.to/valuecodes/back-to-basics-a-solid-foundation-for-using-ai-coding-agents-in-a-monorepo-3c26)
- [pnpm vs npm in 2026](https://thelinuxcode.com/pnpm-vs-npm-in-2026-faster-installs-safer-dependency-graphs-and-a-practical-migration-path/)
- [Setting up a monorepo with pnpm and TypeScript](https://brockherion.dev/blog/posts/setting-up-a-monorepo-with-pnpm-and-typescript/)

**Integration SDKs:**
- [Linear Developers - Getting started with SDK](https://linear.app/developers/sdk)
- [Notion API: Getting Started](https://developers.notion.com/docs/getting-started)
- [Gmail API Node.js quickstart](https://developers.google.com/workspace/gmail/api/quickstart/nodejs)
- [Exa Web Search API](https://exa.ai/)

**Deployment:**
- [How To Deploy Node.js Applications Using Systemd and Nginx](https://www.digitalocean.com/community/tutorials/how-to-deploy-node-js-applications-using-systemd-and-nginx)
- [AI Agent Deployment: Steps and Challenges in 2026](https://research.aimultiple.com/agent-deployment/)
- [Clawdbot Installation & Deployment Guide (2026)](https://www.aifreeapi.com/en/posts/clawdbot-installation-deployment-guide)

**Telegram bots:**
- [Polling vs Webhook in Telegram Bots](https://hostman.com/tutorials/difference-between-polling-and-webhook-in-telegram-bots/)
- [Long Polling vs. Webhooks | grammY](https://grammy.dev/guide/deployment-types)

**Node.js & TypeScript:**
- [Node.js v23 Natively Supports TypeScript](https://medium.com/@reekystive/node-js-v23-natively-supports-typescript-65ae8932d4f5)
- [Node 22 and TypeScript: A Comprehensive Guide](https://www.xjavascript.com/blog/node-22-typescript/)
- [TypeScript 5.8 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html)

---

## Next Steps

After reviewing this stack document, proceed to:

1. **Review existing codebase** — Confirm current dependencies and architecture patterns
2. **Create ARCHITECTURE.md** — Map component boundaries and data flow
3. **Create FEATURES.md** — Identify table stakes vs differentiators for personal AI assistant
4. **Create PITFALLS.md** — Document common mistakes in AI agent development
5. **Create SUMMARY.md** — Synthesize all research with roadmap implications

**This STACK.md document is ready for roadmap creation.**
