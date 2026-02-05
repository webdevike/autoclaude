# Phase 2: Integrations - Research

**Researched:** 2026-02-05
**Domain:** Extension systems, Telegram bot streaming, agent delegation, web search APIs
**Confidence:** MEDIUM-HIGH

## Summary

Phase 2 transforms the agent's tool ecosystem from custom Integration interfaces to pi-mono's Extension format, integrates pi-coding-agent for complex coding tasks, and connects Telegram channel with streaming progress updates.

The key finding: pi-mono provides a complete Extension API (`@mariozechner/pi-coding-agent`) that standardizes tool registration, lifecycle events, and hot-reloading. This replaces our custom `Integration` interface pattern. The SDK also supports programmatic agent delegation through `createAgentSession()`, enabling seamless handoff to pi-coding-agent for coding tasks.

For Telegram streaming, the challenge is rate limiting: editMessageText allows only 20 edits/minute per chat. The gateway already implements 1-second throttling (EDIT_THROTTLE_MS), which aligns with Telegram's practical limits. Status updates from pi-coding-agent events can stream through this existing mechanism.

**Primary recommendation:** Adopt pi-mono Extension format for all tools, use SDK's createAgentSession() for pi-coding-agent delegation in tmux, and enhance gateway streaming with pi-agent-core event subscriptions.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @mariozechner/pi-coding-agent | ^0.52.3 | Extension API, SDK, coding agent delegation | Official pi-mono coding agent with Extension system, already in package.json |
| @mariozechner/pi-agent-core | ^0.52.0 | Agent runtime, event-driven execution | Already powering Phase 1 agent loop, provides event subscriptions |
| @mariozechner/pi-ai | ^0.52.2 | LLM unified API, model registry | Already in use for Phase 1 LLM integration |
| @sinclair/typebox | ^0.34.48 | Runtime schema validation | Already in use, pi-mono uses TypeBox for tool parameters |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| exa-js | Latest | Web search API with image support | TOOL-04 requirement for web search |
| node-telegram-bot-api or native fetch | N/A | Telegram Bot API client | Already using native fetch in telegram channel |
| jiti | Implicit (via pi) | TypeScript execution without compilation | Used by pi-mono for hot-reloading extensions |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pi Extension format | Custom Integration interface | Custom = more flexibility but loses hot-reloading, lifecycle events, and ecosystem compatibility |
| Pi SDK delegation | Direct tmux spawn + bash tools | Manual = more control but loses session management, streaming, and tool validation |
| Native Telegram fetch | grammy library | grammy has long-polling issues (per current code comments), fetch is working |

**Installation:**
```bash
# Already installed in Phase 1
# Only new addition:
npm install exa-js
```

## Architecture Patterns

### Recommended Project Structure
```
packages/
├── core/
│   ├── src/
│   │   ├── agent.ts              # AgentOrchestrator (triage + delegation)
│   │   ├── pi-session.ts         # Pi SDK wrapper (already exists)
│   │   └── extensions/           # NEW: Extension runtime for tools
│   │       ├── core-tools.ts     # Read, Write, Edit, Bash (from pi-mono)
│   │       └── extension-loader.ts  # Load Extensions like integrations
│   └── package.json
├── extensions/                    # NEW: Hot-reloadable Extensions
│   ├── gmail/
│   │   └── index.ts              # Gmail Extension (OAuth2)
│   ├── linear/
│   │   └── index.ts              # Linear Extension (API key)
│   ├── notion/
│   │   └── index.ts              # Notion Extension (API key)
│   └── exa/
│       └── index.ts              # Exa web search Extension
├── gateway/
│   └── src/
│       └── index.ts              # Streaming gateway (already implements throttling)
└── channels/
    └── telegram/
        └── src/
            └── index.ts          # Telegram channel (already implements editMessage)
```

### Pattern 1: Pi Extension Format

**What:** TypeScript modules that export a default function receiving ExtensionAPI
**When to use:** All tools (core, integrations, web search)
**Example:**
```typescript
// Source: https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "gmail_list_messages",
    label: "List Gmail Messages",
    description: "List recent Gmail messages, optionally filtered by query",
    parameters: Type.Object({
      query: Type.Optional(Type.String({ description: "Gmail search query" })),
      maxResults: Type.Optional(Type.Number({ default: 10 })),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      // Stream progress
      onUpdate?.({ content: [{ type: "text", text: "Fetching messages..." }] });

      // Perform operation (existing gmail integration logic)
      const result = await gmail.users.messages.list({ ... });

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        details: { messageIds: result.map(m => m.id) }, // Persisted in session
      };
    },
  });
}
```

### Pattern 2: Pi-Coding-Agent Delegation

**What:** Programmatic agent session creation for complex coding tasks
**When to use:** When triage detects coding work (file operations, multi-step analysis)
**Example:**
```typescript
// Source: https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/sdk.md
import { createAgentSession, SessionManager, createCodingTools } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

async function delegateToCodingAgent(task: string, cwd: string) {
  const model = getModel("anthropic", "claude-sonnet-4");

  const { session } = await createAgentSession({
    model,
    cwd,
    tools: createCodingTools(cwd),  // Read, Write, Edit, Bash
    sessionManager: SessionManager.create(cwd),
    authStorage,
    modelRegistry,
  });

  // Subscribe to streaming events
  session.subscribe((event) => {
    if (event.type === "message_update") {
      // Forward to Telegram via gateway streaming
    }
    if (event.type === "tool_execution_start") {
      // Show tool status in Telegram
    }
  });

  await session.prompt(task);
  return session.state.messages; // Final conversation history
}
```

### Pattern 3: Telegram Streaming with Rate Limit Throttling

**What:** Progressive message edits with 1-second throttle
**When to use:** All long-running agent responses
**Example:**
```typescript
// Source: Current gateway/src/index.ts (already implemented)
const EDIT_THROTTLE_MS = 1000; // Telegram limit: 20 edits/minute
let accumulated = "";
let lastEditTime = 0;

const doEdit = (text: string) => {
  const now = Date.now();
  if (now - lastEditTime >= EDIT_THROTTLE_MS) {
    lastEditTime = now;
    channel.editMessage(recipient, messageId, text).catch(() => {});
  } else {
    // Schedule edit for when throttle expires
    setTimeout(() => {
      channel.editMessage(recipient, messageId, text).catch(() => {});
    }, EDIT_THROTTLE_MS - (now - lastEditTime));
  }
};

// Connect to pi-agent-core events
session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    accumulated += event.assistantMessageEvent.delta;
    doEdit(accumulated);
  }
});
```

### Pattern 4: Tmux Session Management for Pi-Coding-Agent

**What:** Spawn pi-coding-agent in tmux for observability, capture session ID
**When to use:** Coding task delegation (AGNT-04)
**Example:**
```typescript
// Source: Existing packages/core/src/tmux.ts + Pi SDK pattern
import { TmuxManager } from "./tmux.js";
import { createAgentSession } from "@mariozechner/pi-coding-agent";

const tmux = new TmuxManager();
const windowName = `coding-${sessionId}`;

// Spawn pi in tmux window (for visibility)
tmux.spawnAgent(windowName, `cd ${cwd} && pi`);

// But control it programmatically via SDK (not stdin)
const { session } = await createAgentSession({ ... });

// User can peek at tmux window: tmux attach -t jarvis-agents:coding-abc123
```

### Anti-Patterns to Avoid

- **Custom tool validation:** Don't write JSON Schema validators manually — TypeBox handles this and pi-mono expects TypeBox schemas
- **Direct LLM calls in tools:** Tools should be pure operations; let pi-agent-core handle LLM orchestration
- **Ignoring output truncation:** Tools must truncate large outputs to 50KB/2000 lines (use `truncateHead` from pi-coding-agent)
- **Blocking UI calls in RPC mode:** Check `ctx.hasUI` before using `ctx.ui.confirm()` — Telegram integration may not support interactive prompts
- **Storing extension state in memory:** Use `pi.appendEntry()` for persistence or tool result `details` for session branching

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tool parameter validation | Manual JSON checks | TypeBox schemas + pi-mono validation | pi-mono expects TypeBox, provides runtime validation, type inference |
| Output truncation | Manual line/byte counting | `truncateHead()` from pi-coding-agent | Handles edge cases (multi-byte chars, partial lines), matches pi's 50KB/2000 line limits |
| Session persistence | Custom JSONL writer | SessionManager from pi-coding-agent | Handles branching, compaction, metadata, already integrated with pi-agent-core |
| Extension hot-reloading | File watchers + dynamic imports | Pi Extension API + jiti | Built-in `/reload` command, handles dependency resolution, error recovery |
| Telegram rate limiting | Ad-hoc throttling | Token bucket with exponential backoff | Current 1-second throttle is correct but needs retry logic for 429 errors |
| LLM streaming | Custom buffer management | pi-agent-core event subscriptions | Standardized events (text_delta, tool_execution_start), handles backpressure |

**Key insight:** Pi-mono is a complete agent toolkit. Don't reimplement its pieces — adopt the Extension API and SDK patterns.

## Common Pitfalls

### Pitfall 1: Extension Discovery vs Manual Registration

**What goes wrong:** Extensions in `~/.pi/agent/extensions/` or `.pi/extensions/` auto-load with pi CLI, but SDK mode requires manual registration via `ResourceLoader`
**Why it happens:** Pi CLI uses `DefaultResourceLoader` with file scanning; SDK uses `ResourceLoader` interface you provide
**How to avoid:** For Jarvis, create extensions in `packages/extensions/*/index.ts` and register them programmatically in agent setup:
```typescript
const resourceLoader = {
  getExtensions: () => {
    const runtime = createExtensionRuntime();
    const extensions = [
      { path: "./extensions/gmail", module: await import("./extensions/gmail") },
      // ... other extensions
    ];
    return { extensions, errors: [], runtime };
  },
  // ... other ResourceLoader methods
};
```
**Warning signs:** Tools not appearing in pi session, `/reload` command not working

### Pitfall 2: Telegram editMessageText 429 Rate Limit

**What goes wrong:** Bots hit 20 edits/minute limit and start failing with 429 errors
**Why it happens:** Streaming updates can generate >20 edits if agent takes >60 seconds
**How to avoid:**
1. Current 1-second throttle is correct baseline (max 60 edits/minute)
2. Add exponential backoff for 429 responses (wait specified seconds, retry)
3. Implement token bucket per-chat (not per-process) to handle multi-container deployments
4. For very long tasks, reduce edit frequency dynamically (every 2-3 seconds after 30 edits)
**Warning signs:** `Telegram API error: Too Many Requests` in logs, messages failing to update mid-stream

### Pitfall 3: OAuth2 Token Refresh in Extensions

**What goes wrong:** Gmail OAuth tokens expire after 1 hour, integration stops working
**Why it happens:** Extensions need to handle token refresh lifecycle, not just initial auth
**How to avoid:** Use google.auth.OAuth2 with refresh_token, set up automatic refresh:
```typescript
const auth = new google.auth.OAuth2(clientId, clientSecret);
auth.setCredentials({ refresh_token: refreshToken });
// google library auto-refreshes access tokens
this.gmail = google.gmail({ version: "v1", auth });
```
Store refresh_token in environment variable or secure config, NOT in session storage
**Warning signs:** Tools work initially then fail after ~1 hour with 401 Unauthorized

### Pitfall 4: TypeBox Enum vs StringEnum

**What goes wrong:** Tool parameters with Union types don't work with Google's Gemini API
**Why it happens:** Gemini expects `enum` in JSON Schema, but TypeBox `Type.Union()` generates `anyOf`
**How to avoid:** Always use `StringEnum` from pi-ai for enum parameters:
```typescript
import { StringEnum } from "@mariozechner/pi-ai";

parameters: Type.Object({
  action: StringEnum(["list", "create", "delete"] as const), // ✅ Works
  // NOT: Type.Union([Type.Literal("list"), ...])  // ❌ Breaks Gemini
})
```
**Warning signs:** Tool calls fail with Gemini models but work with Claude/OpenAI

### Pitfall 5: Tmux Window Lifecycle Management

**What goes wrong:** Tmux windows accumulate from failed sessions, never cleaned up
**Why it happens:** Agent crashes before calling `tmux.killWindow()`, or user Ctrl+C leaves orphans
**How to avoid:**
1. Use try/finally to ensure cleanup:
```typescript
const windowName = tmux.spawnAgent(...);
try {
  await runCodingAgent();
} finally {
  tmux.killWindow(windowName);
}
```
2. On agent startup, scan for stale windows (>24h old) and kill them
3. Provide `/cleanup` command to manually prune tmux session
**Warning signs:** `tmux list-windows -t jarvis-agents` shows dozens of old windows

### Pitfall 6: Extension State Persistence

**What goes wrong:** Extension state (e.g., cached Linear team IDs) lost on agent restart or session branch
**Why it happens:** In-memory state doesn't survive restarts; session branching creates new timelines
**How to avoid:**
- For session-scoped state: Store in tool result `details` object (persisted in session history)
- For cross-session state: Use `pi.appendEntry("my-ext-state", data)` (not sent to LLM, persists in session file)
- For global state: Write to `~/.jarvis/extensions/my-ext/state.json` and reload on `session_start` event
**Warning signs:** Tools "forget" previous results after agent restart or `/sessions switch`

## Code Examples

Verified patterns from official sources:

### Extension Registration (Gmail Example)

```typescript
// Source: https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { google } from "googleapis";

export default function (pi: ExtensionAPI) {
  let gmail: ReturnType<typeof google.gmail> | null = null;

  // Initialize on session start
  pi.on("session_start", async (event, ctx) => {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      console.warn("[gmail] Missing OAuth2 credentials, extension disabled.");
      return;
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    gmail = google.gmail({ version: "v1", auth });

    console.log("[gmail] Extension initialized.");
  });

  // Register tool
  pi.registerTool({
    name: "gmail_list_messages",
    label: "List Gmail Messages",
    description: "List recent Gmail messages, optionally filtered by query",
    parameters: Type.Object({
      query: Type.Optional(Type.String({ description: "Gmail search query like 'is:unread'" })),
      maxResults: Type.Optional(Type.Number({ default: 10, minimum: 1, maximum: 50 })),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!gmail) {
        return {
          content: [{ type: "text", text: "Gmail not initialized (missing credentials)" }],
        };
      }

      onUpdate?.({ content: [{ type: "text", text: "Fetching messages from Gmail..." }] });

      const res = await gmail.users.messages.list({
        userId: "me",
        q: params.query || "is:unread",
        maxResults: params.maxResults || 10,
      });

      const messages = res.data.messages ?? [];
      const summaries = await Promise.all(
        messages.map(async (m) => {
          const full = await gmail!.users.messages.get({
            userId: "me",
            id: m.id!,
            format: "metadata",
            metadataHeaders: ["From", "Subject", "Date"],
          });
          const headers = full.data.payload?.headers ?? [];
          return {
            id: m.id,
            from: headers.find((h) => h.name === "From")?.value,
            subject: headers.find((h) => h.name === "Subject")?.value,
            date: headers.find((h) => h.name === "Date")?.value,
            snippet: full.data.snippet,
          };
        })
      );

      return {
        content: [{ type: "text", text: JSON.stringify(summaries, null, 2) }],
        details: { messageCount: summaries.length },
      };
    },
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async () => {
    gmail = null;
    console.log("[gmail] Extension shutdown.");
  });
}
```

### Pi-Coding-Agent SDK Delegation

```typescript
// Source: https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/sdk.md
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  createCodingTools,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import type { StreamProgressEvent } from "./types.js";

interface CodingDelegationConfig {
  task: string;
  cwd: string;
  modelString: string;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  onProgress?: (event: StreamProgressEvent) => void;
}

async function delegateToCodingAgent(config: CodingDelegationConfig): Promise<string> {
  const { provider, model: modelId } = parseModelString(config.modelString);
  const model = getModel(provider as any, modelId as any);

  const { session } = await createAgentSession({
    model,
    thinkingLevel: "off",
    cwd: config.cwd,
    tools: createCodingTools(config.cwd), // Read, Write, Edit, Bash
    sessionManager: SessionManager.create(config.cwd),
    authStorage: config.authStorage,
    modelRegistry: config.modelRegistry,
  });

  let accumulated = "";

  // Subscribe to streaming events
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update") {
      const msgEvent = event.assistantMessageEvent;
      if (msgEvent.type === "text_delta") {
        accumulated += msgEvent.delta;
        config.onProgress?.({
          type: "text_delta",
          delta: msgEvent.delta,
          text: accumulated,
        });
      }
    } else if (event.type === "tool_execution_start") {
      config.onProgress?.({
        type: "tool_use",
        toolName: event.toolName,
      });
    } else if (event.type === "turn_end") {
      config.onProgress?.({
        type: "status",
        text: "Agent completing turn...",
      });
    }
  });

  try {
    await session.prompt(config.task);

    // Extract final response
    const messages = session.state.messages;
    const lastMessage = messages[messages.length - 1];

    if (lastMessage?.role === "assistant") {
      const textContent = lastMessage.content.filter((c: any) => c.type === "text");
      const finalText = textContent.map((c: any) => c.text).join("");
      accumulated = finalText;
    }

    config.onProgress?.({ type: "done", finalText: accumulated });
    return accumulated;
  } finally {
    unsubscribe();
  }
}
```

### Exa Web Search Tool

```typescript
// Source: https://exa.ai/docs/reference/search + https://www.npmjs.com/package/exa-js
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import Exa from "exa-js";

export default function (pi: ExtensionAPI) {
  let exa: Exa | null = null;

  pi.on("session_start", async () => {
    const apiKey = process.env.EXA_API_KEY;
    if (!apiKey) {
      console.warn("[exa] No API key provided, extension disabled.");
      return;
    }
    exa = new Exa(apiKey);
    console.log("[exa] Extension initialized.");
  });

  pi.registerTool({
    name: "exa_search",
    label: "Exa Web Search",
    description: "Search the web using Exa AI, returns results with optional images",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      numResults: Type.Optional(Type.Number({ default: 10, minimum: 1, maximum: 100 })),
      includeImages: Type.Optional(Type.Boolean({ default: false, description: "Include image URLs in results" })),
      type: Type.Optional(Type.Union([
        Type.Literal("auto"),
        Type.Literal("neural"),
        Type.Literal("fast"),
        Type.Literal("deep"),
      ], { default: "auto" })),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!exa) {
        return {
          content: [{ type: "text", text: "Exa not initialized (missing API key)" }],
        };
      }

      onUpdate?.({ content: [{ type: "text", text: `Searching for: ${params.query}...` }] });

      const searchOptions: any = {
        numResults: params.numResults || 10,
        type: params.type || "auto",
        contents: {
          text: true,
          highlights: true,
        },
      };

      if (params.includeImages) {
        // Exa returns image URLs in search results
        searchOptions.contents.summary = true;
      }

      const response = await exa.search(params.query, searchOptions);

      // Format results
      const results = response.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.text?.slice(0, 200) || r.highlights?.[0] || "",
        image: r.image || null,
        publishedDate: r.publishedDate,
      }));

      return {
        content: [{
          type: "text",
          text: `Found ${results.length} results:\n\n${JSON.stringify(results, null, 2)}`
        }],
        details: { resultCount: results.length, query: params.query },
      };
    },
  });

  pi.on("session_shutdown", async () => {
    exa = null;
    console.log("[exa] Extension shutdown.");
  });
}
```

### Telegram Streaming with Enhanced Progress

```typescript
// Source: Existing gateway/src/index.ts + pi-agent-core events integration
import type { StreamProgressEvent } from "@jarvis/core";

class Gateway {
  private async handleIncoming(msg: Message, channel: Channel, defaultMode: string): Promise<void> {
    let placeholderId = await channel.sendPlaceholder?.(msg.sender, "Thinking...");

    const EDIT_THROTTLE_MS = 1000;
    let accumulated = "";
    let lastEditTime = 0;
    let editTimer: ReturnType<typeof setTimeout> | null = null;

    const doEdit = (text: string) => {
      if (!placeholderId || !channel.editMessage) return;

      const now = Date.now();
      if (now - lastEditTime >= EDIT_THROTTLE_MS) {
        lastEditTime = now;
        channel.editMessage(msg.sender, placeholderId, text).catch(err => {
          if (err.response?.status === 429) {
            // Rate limit hit - implement exponential backoff
            const retryAfter = err.response.data?.parameters?.retry_after || 5;
            console.warn(`[gateway] Rate limited, retrying after ${retryAfter}s`);
            setTimeout(() => {
              channel.editMessage!(msg.sender, placeholderId!, text).catch(() => {});
            }, retryAfter * 1000);
          }
        });
      } else if (!editTimer) {
        const remaining = EDIT_THROTTLE_MS - (now - lastEditTime);
        editTimer = setTimeout(() => {
          lastEditTime = Date.now();
          editTimer = null;
          channel.editMessage!(msg.sender, placeholderId!, text).catch(() => {});
        }, remaining);
      }
    };

    const onProgress = (event: StreamProgressEvent) => {
      if (event.type === "text_delta" && event.delta) {
        accumulated += event.delta;
        doEdit(accumulated);
      } else if (event.type === "tool_use" && event.toolName) {
        const statusText = accumulated
          ? `${accumulated}\n\n_Using ${event.toolName}..._`
          : `Using ${event.toolName}...`;
        doEdit(statusText);
      } else if (event.type === "status" && event.text) {
        doEdit(event.text);
      } else if (event.type === "done" && event.finalText) {
        if (editTimer) clearTimeout(editTimer);
        doEdit(event.finalText);
      }
    };

    try {
      const response = await this.orchestrator.handleMessage(msg, onProgress);
      if (editTimer) clearTimeout(editTimer);

      const finalText = response.text?.trim() || "I processed your request but have no response.";
      if (placeholderId && channel.editMessage) {
        await channel.editMessage(msg.sender, placeholderId, finalText);
      } else {
        await channel.send(msg.sender, finalText);
      }
    } catch (err) {
      if (editTimer) clearTimeout(editTimer);
      console.error(`[gateway] Error:`, err);
      await channel.send(msg.sender, `Error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom Integration interface | Pi Extension API with ExtensionAPI | Pi-mono 0.50+ (Nov 2024) | Extensions get lifecycle events, hot-reload, standardized tool format |
| Manual tmux spawn + bash | Pi SDK createAgentSession() | Pi-mono 0.52+ (Jan 2025) | Programmatic control, session persistence, streaming events |
| JSON Schema manual validation | TypeBox schemas with pi-mono validation | Pi-mono adoption of TypeBox | Type-safe tool parameters, runtime validation, Google Gemini compatibility |
| Custom session JSONL | SessionManager from pi-coding-agent | Pi-mono 0.50+ | Session branching, automatic compaction, metadata support |
| Ad-hoc Telegram throttling | Token bucket with backoff | Telegram API 2026 recommendations | Adaptive rate limits, reputation-based quotas (upcoming) |

**Deprecated/outdated:**
- Custom Integration interface: Replace with Extension API (provides lifecycle events, hot-reload)
- Direct LLM SDK calls in agent: Use pi-ai unified API (already done in Phase 1)
- Type.Union for enums: Use StringEnum from pi-ai (Gemini compatibility)
- Blocking dialogs in extensions: Check ctx.hasUI before using ctx.ui methods (RPC mode has no UI)

## Open Questions

1. **Extension Loading Strategy**
   - What we know: Pi CLI auto-discovers from `~/.pi/agent/extensions/`, SDK requires manual ResourceLoader
   - What's unclear: Best pattern for Jarvis — auto-discovery (write to ~/.jarvis/extensions/) or manual registration (packages/extensions/)?
   - Recommendation: Manual registration for Phase 2 (simpler, no file watching), add auto-discovery in Phase 4 if needed

2. **Pi-Coding-Agent Session Lifecycle**
   - What we know: createAgentSession() creates a session, session.prompt() sends messages
   - What's unclear: How to properly close/cleanup sessions? Does SessionManager.create() persist to disk automatically?
   - Recommendation: Check pi-mono docs for session.close() or similar, implement cleanup in finally blocks

3. **Exa Image Support Details**
   - What we know: Search results include `image` field, `contents.imageLinks` parameter exists
   - What's unclear: Exact format of imageLinks parameter (number? boolean? object?), how many images returned per result
   - Recommendation: Test with Exa API, start with `includeImages: true` boolean, refine based on response structure

4. **Telegram Adaptive Rate Limits**
   - What we know: Telegram testing adaptive rate windows based on bot reputation (2026 feature)
   - What's unclear: When this deploys, how reputation is calculated, what new limits will be
   - Recommendation: Keep current 1-second throttle, add 429 retry logic, monitor for API changes in 2026 H1

## Sources

### Primary (HIGH confidence)

- **Pi-mono Extension Documentation**: [extensions.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md) - Extension API, lifecycle events, tool registration
- **Pi-mono Coding Agent README**: [README.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/README.md) - SDK usage, RPC mode, integration patterns
- **Pi-mono SDK Documentation**: [sdk.md](https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/sdk.md) - createAgentSession, streaming, session management
- **Exa Search API**: [Exa Docs](https://exa.ai/docs/reference/search) - API parameters, authentication, image support
- **TypeBox GitHub**: [sinclairzx81/typebox](https://github.com/sinclairzx81/typebox) - Schema validation, current version 0.34.48
- **Telegram Bot API**: [core.telegram.org/bots/api](https://core.telegram.org/bots/api) - Official API documentation

### Secondary (MEDIUM confidence)

- **Telegram Rate Limits**: [Telegram Limits](https://limits.tginfo.me/en), [grammy.dev/advanced/flood](https://grammy.dev/advanced/flood) - 20 edits/minute confirmed, best practices for 2026
- **Exa JavaScript SDK**: [exa-js npm](https://www.npmjs.com/package/exa-js) - TypeScript usage examples, verified API patterns
- **Pi-mono Community Resources**: [awesome-pi-agent](https://github.com/qualisero/awesome-pi-agent) - Community extensions, patterns, skills

### Tertiary (LOW confidence)

- **Web search results on Telegram streaming**: Multiple sources discussing message editing, but lacking 2026-specific details on adaptive limits
- **Tmux programmatic control**: Generic bash scripting guides, not specific to Node.js/TypeScript integration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All packages already in use or official Exa SDK
- Architecture: HIGH - Pi Extension API is official and well-documented
- Pitfalls: MEDIUM - Based on Extension docs and current codebase issues (OAuth refresh, rate limits), not direct experience
- Coding examples: HIGH - Adapted from official pi-mono documentation and existing codebase

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30 days - pi-mono is stable, Telegram API rarely changes)

**Key uncertainties to validate during planning:**
- Extension loading strategy (auto-discovery vs manual registration)
- Pi-coding-agent session cleanup lifecycle
- Exa imageLinks parameter exact format
- Whether to use tmux visibility + SDK control or pure SDK delegation
