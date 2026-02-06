# Phase 3: Intelligence - Research

**Researched:** 2026-02-06
**Domain:** User preferences persistence, configuration management, conversation history, dynamic mode switching
**Confidence:** HIGH

## Summary

Phase 3 adds persistent memory and dynamic mode switching to transform Jarvis from a stateless assistant into an intelligent agent that remembers user preferences, maintains conversation history across restarts, and switches between work and personal contexts on-the-fly without restarting.

The research reveals that pi-mono's settings system provides the architectural blueprint: hierarchical JSON configuration with global/project levels, atomic writes for corruption prevention, and precedence-based merging. For Jarvis, this translates to user preferences stored in `~/.jarvis/users/<userId>/preferences.json` with schema validation via TypeBox. Conversation history uses the existing JSONL pattern from Phase 1 with configurable retention policies. Mode switching leverages the existing mode config system but adds runtime reload capability without process restart.

Key insight: The current codebase already has most infrastructure pieces (JSONL session persistence from Phase 1, mode configs in JSON, TypeBox schemas from Phase 2). Phase 3 connects these pieces by adding preference tools, retention policies, and hot-reload capability for mode configs.

**Primary recommendation:** Implement user preferences as JSON files with TypeBox schema validation and confirmation prompts. Add retention policy to existing session persistence. Enable dynamic mode switching by reloading mode configs and creating new Agent instances on `/mode` command without gateway restart.

## Standard Stack

The established libraries for configuration management and schema validation:

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @sinclair/typebox | 0.34.48+ | JSON Schema validation with TypeScript types | Already in use for tool parameters (Phase 2). Runtime validation via `Type.Object()`, compile-time type inference, generates JSON Schema for documentation. [TypeBox GitHub](https://github.com/sinclairzx81/typebox) is the de facto standard for TypeScript schema validation with 7.5k+ stars. |
| ajv | 8.12.0+ | JSON Schema validator engine | Peer dependency of TypeBox, fastest JSON Schema validator. Used by pi-mono for runtime validation. [Ajv docs](https://ajv.js.org/guide/typescript.html) show TypeScript integration. |
| Node.js fs module | Built-in | File I/O for JSON and JSONL | Already in use. Atomic writes via temp file + rename prevent corruption (pattern from pi-mono). |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| typescript-json-schema | Latest | Generate JSON Schema from TypeScript interfaces | Optional - for documentation only. TypeBox already provides runtime schemas. Consider if need human-readable schema docs. |
| chokidar | Latest | File watching for hot-reload | Optional - only if auto-reload on config file changes needed. Start with manual reload via command. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TypeBox + ajv | Zod | Zod is more popular (37k stars) but heavier (11KB vs 5KB), no JSON Schema export by default, not pi-mono compatible. Stick with TypeBox for consistency. |
| JSON files | SQLite database | Database adds complexity for single-user, low-volume data. JSON files are human-readable, version-controllable, and sufficient for personal assistant scale (<1MB). |
| JSONL for history | Vector database | Vector DB (Pinecone, Weaviate) enables semantic search but adds infrastructure complexity. Defer until RAG needed. JSONL with simple retention works for conversation history. |
| Manual retention | Redis TTL | Redis adds external dependency. File-based retention with periodic cleanup is simpler for single-user VPS deployment. |

**Installation:**
```bash
# Already installed in Phase 2
# No new dependencies needed
```

## Architecture Patterns

### Recommended Project Structure
```
packages/
├── core/
│   ├── src/
│   │   ├── agent.ts              # AgentOrchestrator (handles mode switching)
│   │   ├── preferences.ts        # NEW: Preference management
│   │   ├── pi-session.ts         # Session persistence (add retention)
│   │   └── tools/
│   │       ├── core-tools.ts     # Read, Write, Edit, Bash
│   │       └── config-tools.ts   # NEW: get_preference, set_preference
│   └── package.json
├── gateway/
│   └── src/
│       └── index.ts              # Gateway (handle /mode command)
└── cli/
    └── src/
        └── index.ts              # CLI (load preferences on startup)

~/.jarvis/                         # User data directory
├── users/
│   └── <userId>/
│       ├── preferences.json      # User-specific preferences
│       └── sessions/
│           └── messages.jsonl    # Conversation history
└── modes/
    ├── personal.json             # Mode configs (can be reloaded)
    └── work.json
```

### Pattern 1: User Preferences with TypeBox Schema Validation

**What:** Type-safe preference storage with runtime validation
**When to use:** All user preference operations (get, set, validate)
**Example:**
```typescript
// Source: TypeBox docs + pi-mono settings pattern
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

// Define preferences schema
const UserPreferencesSchema = Type.Object({
  tone: Type.Optional(Type.Union([
    Type.Literal('concise'),
    Type.Literal('detailed'),
    Type.Literal('casual'),
  ], { default: 'detailed' })),

  verbosity: Type.Optional(Type.Union([
    Type.Literal('minimal'),
    Type.Literal('normal'),
    Type.Literal('verbose'),
  ], { default: 'normal' })),

  shortcuts: Type.Optional(Type.Record(
    Type.String(),
    Type.String(),
    { description: 'Custom command shortcuts' }
  )),

  behavioralRules: Type.Optional(Type.Array(Type.String(), {
    description: 'User-defined behavioral guidelines'
  })),

  defaultMode: Type.Optional(Type.String({ default: 'personal' })),

  notificationPreferences: Type.Optional(Type.Object({
    statusUpdates: Type.Boolean({ default: true }),
    errorAlerts: Type.Boolean({ default: true }),
  })),
}, {
  additionalProperties: false, // Reject unknown keys
  description: 'User preferences for Jarvis behavior'
});

type UserPreferences = Static<typeof UserPreferencesSchema>;

// Validate and parse preferences
function loadPreferences(userId: string): UserPreferences {
  const prefsPath = path.join(os.homedir(), '.jarvis/users', userId, 'preferences.json');

  try {
    const raw = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));

    // Validate against schema
    if (!Value.Check(UserPreferencesSchema, raw)) {
      const errors = [...Value.Errors(UserPreferencesSchema, raw)];
      console.warn(`[preferences] Validation errors:`, errors);

      // Return defaults on validation failure
      return Value.Default(UserPreferencesSchema, {}) as UserPreferences;
    }

    return raw as UserPreferences;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // No preferences yet, return defaults
      return Value.Default(UserPreferencesSchema, {}) as UserPreferences;
    }
    throw err;
  }
}

// Atomic write with temp file
function savePreferences(userId: string, prefs: UserPreferences): void {
  const userDir = path.join(os.homedir(), '.jarvis/users', userId);
  const prefsPath = path.join(userDir, 'preferences.json');
  const tempPath = `${prefsPath}.${Date.now()}.tmp`;

  // Validate before saving
  if (!Value.Check(UserPreferencesSchema, prefs)) {
    throw new Error('Invalid preferences schema');
  }

  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(tempPath, JSON.stringify(prefs, null, 2));
  fs.renameSync(tempPath, prefsPath); // Atomic on POSIX
}
```

### Pattern 2: Preference Tools with Confirmation Prompts

**What:** Agent tools for reading and writing preferences with user confirmation
**When to use:** MEMR-02, MEMR-03 requirements
**Example:**
```typescript
// Source: Phase 2 Extension pattern + pi-mono confirmation dialogs
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  let preferences: UserPreferences | null = null;
  let userId: string | null = null;

  // Load preferences on session start
  pi.on("session_start", async (event, ctx) => {
    userId = ctx.userId || "default";
    preferences = loadPreferences(userId);
    console.log(`[preferences] Loaded preferences for user ${userId}`);
  });

  // Get preference tool
  pi.registerTool({
    name: "get_preference",
    label: "Get User Preference",
    description: "Retrieve a user preference value by key",
    parameters: Type.Object({
      key: Type.String({ description: "Preference key (e.g., 'tone', 'verbosity')" }),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!preferences) {
        return { content: [{ type: "text", text: "Preferences not loaded" }] };
      }

      const value = (preferences as any)[params.key];
      const result = value !== undefined
        ? `Preference '${params.key}' = ${JSON.stringify(value)}`
        : `Preference '${params.key}' not set (using default)`;

      return { content: [{ type: "text", text: result }] };
    },
  });

  // Set preference tool with confirmation
  pi.registerTool({
    name: "set_preference",
    label: "Set User Preference",
    description: "Update a user preference (requires confirmation)",
    parameters: Type.Object({
      key: Type.String({ description: "Preference key" }),
      value: Type.Unknown({ description: "New preference value" }),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!preferences || !userId) {
        return { content: [{ type: "text", text: "Preferences not loaded" }] };
      }

      // Validate key exists in schema
      const validKeys = Object.keys(UserPreferencesSchema.properties);
      if (!validKeys.includes(params.key)) {
        return {
          content: [{
            type: "text",
            text: `Invalid preference key '${params.key}'. Valid keys: ${validKeys.join(', ')}`
          }]
        };
      }

      // Ask for user confirmation (if UI available)
      if (ctx.hasUI) {
        const confirmed = await ctx.ui.confirm(
          `Save preference '${params.key}' = ${JSON.stringify(params.value)}?`
        );

        if (!confirmed) {
          return { content: [{ type: "text", text: "Preference update cancelled by user" }] };
        }
      }

      // Update and save
      const updated = { ...preferences, [params.key]: params.value };

      try {
        savePreferences(userId, updated);
        preferences = updated;

        return {
          content: [{
            type: "text",
            text: `Preference '${params.key}' updated and saved`
          }],
          details: { preference: params.key, value: params.value },
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `Failed to save preference: ${err instanceof Error ? err.message : 'Unknown error'}`
          }]
        };
      }
    },
  });
}
```

### Pattern 3: Conversation History with Retention Policy

**What:** JSONL append-only history with automatic cleanup of old messages
**When to use:** MEMR-04 requirement
**Example:**
```typescript
// Source: Existing pi-session.ts + retention logic
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

interface SessionMessage {
  timestamp: number;
  role: 'user' | 'assistant' | 'tool_result';
  content: string;
  toolName?: string;
  usage?: { inputTokens: number; outputTokens: number; model: string; cost: number };
}

interface RetentionPolicy {
  maxMessages: number;        // Keep last N messages (default: 50)
  maxAgeDays: number;          // Delete messages older than N days (default: 30)
  minMessages: number;         // Always keep at least N messages (default: 10)
}

class ConversationHistory {
  private sessionPath: string;
  private retentionPolicy: RetentionPolicy;

  constructor(userId: string, policy: Partial<RetentionPolicy> = {}) {
    const sessionDir = path.join(os.homedir(), '.jarvis/users', userId, 'sessions');
    this.sessionPath = path.join(sessionDir, 'messages.jsonl');

    this.retentionPolicy = {
      maxMessages: policy.maxMessages ?? 50,
      maxAgeDays: policy.maxAgeDays ?? 30,
      minMessages: policy.minMessages ?? 10,
    };
  }

  // Append message to JSONL
  async append(message: SessionMessage): Promise<void> {
    const dir = path.dirname(this.sessionPath);
    await fs.mkdir(dir, { recursive: true });

    const line = JSON.stringify(message) + '\n';
    await fs.appendFile(this.sessionPath, line);

    // Trigger cleanup after append
    await this.enforceRetentionPolicy();
  }

  // Load recent messages
  async load(limit?: number): Promise<SessionMessage[]> {
    try {
      const content = await fs.readFile(this.sessionPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);

      const messages: SessionMessage[] = [];
      for (const line of lines) {
        try {
          messages.push(JSON.parse(line));
        } catch (err) {
          console.warn('[history] Skipping invalid JSONL line:', line.slice(0, 100));
        }
      }

      // Return last N messages
      const count = limit ?? this.retentionPolicy.maxMessages;
      return messages.slice(-count);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return []; // No history yet
      }
      throw err;
    }
  }

  // Enforce retention policy
  private async enforceRetentionPolicy(): Promise<void> {
    const messages = await this.load(Infinity); // Load all

    if (messages.length <= this.retentionPolicy.minMessages) {
      return; // Don't delete if below minimum
    }

    const now = Date.now();
    const maxAgeMs = this.retentionPolicy.maxAgeDays * 24 * 60 * 60 * 1000;

    // Filter: keep messages within age limit AND last maxMessages
    const filtered = messages
      .filter(m => now - m.timestamp < maxAgeMs) // Age filter
      .slice(-this.retentionPolicy.maxMessages); // Count filter

    // Ensure minimum messages preserved
    const kept = filtered.length >= this.retentionPolicy.minMessages
      ? filtered
      : messages.slice(-this.retentionPolicy.minMessages);

    if (kept.length < messages.length) {
      // Rewrite file with filtered messages
      const tempPath = `${this.sessionPath}.${Date.now()}.tmp`;
      const content = kept.map(m => JSON.stringify(m)).join('\n') + '\n';

      await fs.writeFile(tempPath, content);
      await fs.rename(tempPath, this.sessionPath);

      console.log(`[history] Retention policy enforced: ${messages.length} → ${kept.length} messages`);
    }
  }

  // Get retention stats
  async getStats(): Promise<{ total: number; oldest: number; newest: number }> {
    const messages = await this.load(Infinity);

    if (messages.length === 0) {
      return { total: 0, oldest: 0, newest: 0 };
    }

    return {
      total: messages.length,
      oldest: messages[0].timestamp,
      newest: messages[messages.length - 1].timestamp,
    };
  }
}
```

### Pattern 4: Dynamic Mode Switching Without Restart

**What:** Hot-reload mode configs and create new Agent instances on-the-fly
**When to use:** MODE-02 requirement - user switches modes via `/mode` command
**Example:**
```typescript
// Source: Existing agent.ts + pi-mono settings reload pattern
import { getModel } from '@mariozechner/pi-ai';
import { Agent } from '@mariozechner/pi-agent-core';

class AgentOrchestrator {
  private modes: Map<string, ModeConfig>;
  private currentMode: string;
  private configDir: string;

  constructor(configDir: string, initialMode: string) {
    this.configDir = configDir;
    this.modes = new Map();
    this.currentMode = initialMode;

    this.loadAllModes();
  }

  // Load or reload all mode configs from disk
  private loadAllModes(): void {
    const modeFiles = fs.readdirSync(this.configDir)
      .filter(f => f.endsWith('.json') && !f.startsWith('.'));

    for (const file of modeFiles) {
      const modeName = path.basename(file, '.json');
      const configPath = path.join(this.configDir, file);

      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as ModeConfig;
        this.modes.set(modeName, config);
        console.log(`[orchestrator] Loaded mode: ${modeName}`);
      } catch (err) {
        console.error(`[orchestrator] Failed to load mode ${modeName}:`, err);
      }
    }

    if (!this.modes.has(this.currentMode)) {
      throw new Error(`Current mode '${this.currentMode}' not found in configs`);
    }
  }

  // Switch mode at runtime (hot-reload config)
  async switchMode(newMode: string): Promise<string> {
    if (!this.modes.has(newMode)) {
      // Try reloading configs in case new mode was added
      this.loadAllModes();

      if (!this.modes.has(newMode)) {
        const available = Array.from(this.modes.keys()).join(', ');
        throw new Error(`Mode '${newMode}' not found. Available: ${available}`);
      }
    }

    const oldMode = this.currentMode;
    this.currentMode = newMode;

    console.log(`[orchestrator] Switched mode: ${oldMode} → ${newMode}`);
    return `Switched to ${newMode} mode`;
  }

  // Get current mode config (always fresh)
  getCurrentModeConfig(): ModeConfig {
    const config = this.modes.get(this.currentMode);
    if (!config) {
      throw new Error(`Current mode '${this.currentMode}' not loaded`);
    }
    return config;
  }

  // Create new Agent instance for current mode
  private createAgentForMode(modeConfig: ModeConfig): Agent {
    const { provider, model: modelId } = this.parseModel(modeConfig.smart.model);
    const model = getModel(provider, modelId);

    return new Agent({
      initialState: {
        systemPrompt: modeConfig.systemPrompt,
        model,
        // Tools from current mode's integrations
      },
    });
  }

  // Handle message with current mode context
  async handleMessage(msg: Message, onProgress?: (status: string) => void): Promise<AgentResponse> {
    const modeConfig = this.getCurrentModeConfig();

    // Inject user preferences into system prompt
    const preferences = loadPreferences(msg.sender);
    const enhancedPrompt = this.injectPreferences(modeConfig.systemPrompt, preferences);

    // Create agent with current mode config (short-lived)
    const agent = this.createAgentForMode({ ...modeConfig, systemPrompt: enhancedPrompt });

    // ... existing agent execution logic
  }

  // Inject preferences into system prompt
  private injectPreferences(basePrompt: string, prefs: UserPreferences): string {
    const prefContext = [
      basePrompt,
      "",
      "## User Preferences",
      `- Response tone: ${prefs.tone || 'detailed'}`,
      `- Verbosity level: ${prefs.verbosity || 'normal'}`,
    ];

    if (prefs.behavioralRules && prefs.behavioralRules.length > 0) {
      prefContext.push("- Behavioral guidelines:");
      prefs.behavioralRules.forEach(rule => prefContext.push(`  - ${rule}`));
    }

    if (prefs.shortcuts && Object.keys(prefs.shortcuts).length > 0) {
      prefContext.push("- Custom shortcuts:");
      Object.entries(prefs.shortcuts).forEach(([cmd, desc]) => {
        prefContext.push(`  - ${cmd}: ${desc}`);
      });
    }

    return prefContext.join('\n');
  }
}
```

### Pattern 5: Mode-Specific Configuration

**What:** Separate credentials, system prompts, and tool access per mode
**When to use:** MODE-01, MODE-03 requirements
**Example:**
```typescript
// Mode config schema with TypeBox
const ModeConfigSchema = Type.Object({
  mode: Type.String({ description: "Mode identifier" }),

  systemPrompt: Type.String({
    description: "Base system prompt for this mode"
  }),

  tone: Type.Optional(Type.Union([
    Type.Literal('professional'),
    Type.Literal('casual'),
    Type.Literal('technical'),
  ], { default: 'casual' })),

  triage: Type.Object({
    model: Type.String(),
    maxTokens: Type.Number({ default: 1024 }),
  }),

  smart: Type.Object({
    model: Type.String(),
    maxTokens: Type.Number({ default: 8192 }),
  }),

  channels: Type.Array(Type.String()),

  integrations: Type.Array(Type.String(), {
    description: "Enabled extensions for this mode"
  }),

  cwd: Type.Optional(Type.String({
    description: "Default working directory for tool execution"
  })),

  statusInterval: Type.Number({ default: 300 }),

  crons: Type.Array(Type.Object({
    name: Type.String(),
    schedule: Type.String(),
    prompt: Type.String(),
    tier: Type.Union([Type.Literal('triage'), Type.Literal('smart')]),
    mode: Type.String(),
  })),
});

// Example: config/work.json
{
  "mode": "work",
  "systemPrompt": "You are Jarvis in work mode. Be professional, concise, and focused on productivity.",
  "tone": "professional",
  "triage": {
    "model": "openrouter/google/gemini-2.5-flash-lite",
    "maxTokens": 1024
  },
  "smart": {
    "model": "openrouter/anthropic/claude-sonnet-4",
    "maxTokens": 8192
  },
  "channels": ["telegram"],
  "integrations": ["linear", "gmail"],  // Work tools only
  "cwd": "/home/ike/workspace",
  "statusInterval": 300,
  "crons": []
}

// Example: config/personal.json
{
  "mode": "personal",
  "systemPrompt": "You are Jarvis, a personal AI assistant. Be casual, helpful, and proactive.",
  "tone": "casual",
  "triage": {
    "model": "openrouter/google/gemini-2.5-flash-lite",
    "maxTokens": 1024
  },
  "smart": {
    "model": "openrouter/anthropic/claude-sonnet-4",
    "maxTokens": 8192
  },
  "channels": ["telegram"],
  "integrations": ["notion", "gmail"],  // Personal tools only
  "cwd": "/home/ike/personal",
  "statusInterval": 300,
  "crons": []
}
```

### Anti-Patterns to Avoid

- **Don't store secrets in preferences:** API keys, OAuth tokens belong in environment variables or system keyring, not user preferences
- **Don't allow arbitrary code in preferences:** Validate against schema, reject unknown keys (additionalProperties: false)
- **Don't use synchronous I/O in production:** Use fs.promises for file operations to avoid blocking event loop
- **Don't skip atomic writes:** Always use temp file + rename for JSON writes to prevent corruption on crash
- **Don't load entire history into memory:** Use streaming or pagination for large JSONL files
- **Don't create new Agent per message:** Short-lived agents are fine, but reuse within same conversation turn if possible

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON Schema validation | Manual type checks | TypeBox + ajv | Runtime validation, type inference, JSON Schema export, pi-mono compatibility |
| File watching for config reload | Custom fs.watch wrapper | chokidar (optional) or manual `/reload` command | File watching has edge cases (rename events, editor temp files). Start simple with command-based reload. |
| Configuration merging | Object.assign or spread | Deep merge library or hierarchical load | Precedence rules (CLI > project > global), array handling (replace vs append), type coercion |
| Atomic file writes | fs.writeFileSync | Temp file + fs.renameSync | POSIX atomic rename prevents corruption. Pi-mono pattern: write to .tmp, rename to final. |
| Retention policy scheduling | setInterval for cleanup | On-write cleanup + daily cron | Cleanup on append is simpler than background timers. Add cron for large histories. |
| System prompt injection | String concatenation | Template system with sanitization | Prevent prompt injection via user preferences. Validate before interpolation. |

**Key insight:** Pi-mono's SettingsManager demonstrates best practices for hierarchical configuration with atomic writes and merge strategies. Adopt this pattern for Jarvis preferences and mode configs.

## Common Pitfalls

### Pitfall 1: Memory Poisoning via Preferences

**What goes wrong:** Malicious input (via prompt injection or compromised integration) writes harmful data to preferences. Agent loads poisoned preferences and executes unintended actions (e.g., shell commands, data exfiltration).

**Why it happens:** Preferences treated as "data" rather than "code," but LLMs blur this distinction. No input validation on what can be written to preferences.

**How to avoid:**
1. **Schema validation:** Use TypeBox with `additionalProperties: false` to reject unknown keys
2. **Allowlist approach:** Only permit specific preference keys defined in schema
3. **Diff approval:** Show user what changed before saving preferences
4. **Sandboxed preferences:** Preferences affect behavior but never trigger executable actions directly
5. **Regular audit:** Scan preferences for suspicious patterns (URLs, shell commands)

**Warning signs:**
- Unexpected commands in preferences JSON
- Preferences containing URLs to unknown domains
- Shell operators or code keywords in preference values
- Agent behaving differently after preference update

**Implementation:**
```typescript
// Validate preference value doesn't contain executable content
function validatePreferenceValue(key: string, value: unknown): boolean {
  const valueStr = JSON.stringify(value);

  // Reject executable patterns
  const dangerousPatterns = [
    /\$\{.*\}/,              // Template literals
    /\$\(.*\)/,              // Command substitution
    /`.*`/,                  // Backticks
    /https?:\/\/(?!(?:github|notion|linear)\.com)/i, // URLs to unknown domains
    /;\s*\w+/,               // Shell command chains
    /\|\s*\w+/,              // Pipes
    />\s*\/\w+/,             // Redirects
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(valueStr)) {
      console.warn(`[preferences] Rejected dangerous pattern in '${key}':`, valueStr.slice(0, 50));
      return false;
    }
  }

  return true;
}
```

### Pitfall 2: JSONL File Corruption on Crash

**What goes wrong:** JSONL file gets corrupted due to partial writes during crash or concurrent writes, breaking session load on restart.

**Why it happens:** Append operations are not atomic. Power loss or kill signal during write leaves partial JSON line.

**How to avoid:**
1. **Validate on read:** Parse JSONL line-by-line, skip invalid entries with warning
2. **Atomic append:** Write to temp file, append to main, delete temp (from Pattern 3 in Phase 1 research)
3. **Periodic snapshots:** Compact to new file periodically, validate old file
4. **Error recovery:** Truncate to last valid line if corruption detected

**Warning signs:**
- "Unexpected token" JSON parse errors on restart
- Missing messages in conversation history
- File size doesn't match message count

**Implementation:**
```typescript
// Safe JSONL read with corruption recovery
async function safeLoadHistory(sessionPath: string): Promise<SessionMessage[]> {
  try {
    const content = await fs.readFile(sessionPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const messages: SessionMessage[] = [];
    const invalidLines: number[] = [];

    lines.forEach((line, idx) => {
      try {
        messages.push(JSON.parse(line));
      } catch (err) {
        console.warn(`[history] Invalid JSONL at line ${idx + 1}:`, line.slice(0, 100));
        invalidLines.push(idx);
      }
    });

    // If >10% invalid, file may be corrupted
    if (invalidLines.length > lines.length * 0.1) {
      console.error(`[history] File appears corrupted (${invalidLines.length}/${lines.length} invalid lines)`);

      // Backup corrupt file
      await fs.copyFile(sessionPath, `${sessionPath}.corrupt.${Date.now()}`);

      // Rewrite with valid messages only
      const validContent = messages.map(m => JSON.stringify(m)).join('\n') + '\n';
      await fs.writeFile(sessionPath, validContent);

      console.log(`[history] Recovered ${messages.length} valid messages`);
    }

    return messages;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return []; // No history yet
    }
    throw err;
  }
}
```

### Pitfall 3: Mode Switch During Active Session

**What goes wrong:** User switches modes while agent is processing a task. Agent continues with old mode config, or worse, switches mid-execution causing inconsistent behavior.

**Why it happens:** Mode switch doesn't wait for active sessions to complete. Agent references mode config that changed underneath it.

**How to avoid:**
1. **Session-locked mode:** Capture mode config at session start, don't reload mid-session
2. **Queue mode switches:** Defer switch until active sessions complete
3. **Cancel or warn:** Ask user to confirm mode switch if sessions are active
4. **Idempotent agents:** Create new Agent instance per session with captured config

**Warning signs:**
- Agent uses wrong integrations mid-task
- System prompt changes during conversation
- Tool not found errors after mode switch

**Implementation:**
```typescript
class AgentOrchestrator {
  private activeSessions: Map<string, AgentSession>;

  async switchMode(newMode: string): Promise<string> {
    // Check for active sessions
    const active = Array.from(this.activeSessions.values())
      .filter(s => s.status === 'running');

    if (active.length > 0) {
      const sessionIds = active.map(s => s.id).join(', ');
      return `Cannot switch mode: ${active.length} sessions active (${sessionIds}). Wait for completion or cancel sessions.`;
    }

    // Safe to switch - no active work
    const oldMode = this.currentMode;
    this.loadAllModes(); // Reload from disk
    this.currentMode = newMode;

    console.log(`[orchestrator] Mode switched: ${oldMode} → ${newMode}`);
    return `Switched to ${newMode} mode. New sessions will use updated config.`;
  }

  // Each session captures mode config at creation
  async handleMessage(msg: Message): Promise<AgentResponse> {
    const sessionConfig = this.getCurrentModeConfig(); // Snapshot

    const session = {
      id: randomUUID(),
      modeConfig: sessionConfig, // Captured, won't change
      startedAt: Date.now(),
    };

    this.activeSessions.set(session.id, session);

    try {
      // Use captured config for entire session
      return await this.runAgent(session);
    } finally {
      this.activeSessions.delete(session.id);
    }
  }
}
```

### Pitfall 4: Unbounded Preference Growth

**What goes wrong:** Preferences JSON grows unbounded as agent adds entries (e.g., shortcuts, behavioral rules). File becomes megabytes, slowing reads/writes.

**Why it happens:** No size limits on preference fields like `shortcuts` or `behavioralRules`.

**How to avoid:**
1. **Schema limits:** Use TypeBox `maxItems` for arrays, `maxLength` for strings
2. **Validation on set:** Reject preference updates that exceed limits
3. **Periodic cleanup:** Warn user if preferences exceed threshold (e.g., 100KB)
4. **Separate storage:** Move large data (notes, history) to separate files, keep preferences small

**Warning signs:**
- Preferences file >100KB
- Slow agent startup (loading preferences)
- Array fields with >100 items

**Implementation:**
```typescript
const UserPreferencesSchema = Type.Object({
  // ... other fields

  shortcuts: Type.Optional(Type.Record(
    Type.String(),
    Type.String(),
    {
      description: 'Custom command shortcuts',
      maxProperties: 50, // Limit to 50 shortcuts
    }
  )),

  behavioralRules: Type.Optional(Type.Array(Type.String(), {
    description: 'User-defined behavioral guidelines',
    maxItems: 20, // Limit to 20 rules
    maxLength: 500, // Max 500 chars per rule
  })),
});

// Size check on save
function savePreferences(userId: string, prefs: UserPreferences): void {
  const json = JSON.stringify(prefs, null, 2);
  const sizeKB = Buffer.byteLength(json) / 1024;

  if (sizeKB > 100) {
    console.warn(`[preferences] Size warning: ${sizeKB.toFixed(1)}KB (recommend <100KB)`);
    // Continue saving but log warning
  }

  // ... atomic write logic
}
```

### Pitfall 5: Preference Key Collisions with System Settings

**What goes wrong:** User preference key collides with system setting name (e.g., `apiKey`, `mode`, `systemPrompt`). Agent confuses user preferences with system config.

**Why it happens:** No namespacing between user preferences and mode config fields.

**How to avoid:**
1. **Namespace preferences:** Use nested object (`userPreferences.tone` vs `mode.tone`)
2. **Reserved keys:** Reject preference keys that match system config fields
3. **Different files:** Store user preferences in separate file from mode config
4. **Prefix convention:** Prefix all user preference keys with `user_` or similar

**Warning signs:**
- Agent ignores system config in favor of preference
- Mode config gets overwritten by preference
- Unexpected behavior after setting preference

**Implementation:**
```typescript
// Reserved keys that cannot be user preferences
const RESERVED_KEYS = new Set([
  'mode', 'systemPrompt', 'triage', 'smart',
  'channels', 'integrations', 'statusInterval', 'crons', 'cwd'
]);

function validatePreferenceKey(key: string): boolean {
  if (RESERVED_KEYS.has(key)) {
    console.warn(`[preferences] Rejected reserved key: ${key}`);
    return false;
  }
  return true;
}

// Or use namespacing
interface JarvisConfig {
  mode: ModeConfig;              // System config (config/personal.json)
  userPreferences: UserPreferences; // User preferences (~/.jarvis/users/<id>/preferences.json)
}
```

### Pitfall 6: Race Conditions on Concurrent Preference Updates

**What goes wrong:** Two agent sessions update preferences simultaneously (e.g., cron job + interactive session). Last write wins, losing one update.

**Why it happens:** No file locking on preference writes. Read-modify-write is not atomic.

**How to avoid:**
1. **File locking:** Use `proper-lockfile` npm package for advisory locks
2. **Optimistic locking:** Add version field, reject if version mismatches
3. **Single-writer pattern:** Queue preference updates through single writer
4. **Retry on conflict:** Detect conflict (file mtime changed), reload, retry

**Warning signs:**
- Preference updates silently lost
- File modification time changes during read-modify-write
- Inconsistent preference state across sessions

**Implementation:**
```typescript
import lockfile from 'proper-lockfile';

async function savePreferencesWithLock(userId: string, prefs: UserPreferences): Promise<void> {
  const prefsPath = path.join(os.homedir(), '.jarvis/users', userId, 'preferences.json');

  // Acquire lock (waits if locked by another process)
  const release = await lockfile.lock(prefsPath, {
    retries: { retries: 5, minTimeout: 100 },
    stale: 10000, // Lock expires after 10s
  });

  try {
    // Read current preferences (in case changed by another process)
    const current = loadPreferences(userId);

    // Merge updates (your business logic here)
    const merged = { ...current, ...prefs };

    // Atomic write
    const tempPath = `${prefsPath}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(merged, null, 2));
    await fs.rename(tempPath, prefsPath);

    console.log(`[preferences] Saved with lock for user ${userId}`);
  } finally {
    // Release lock
    await release();
  }
}
```

## Code Examples

Verified patterns from official sources:

### Complete Preferences Manager

```typescript
// Source: Pi-mono SettingsManager + TypeBox validation
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

// Schema definition
const UserPreferencesSchema = Type.Object({
  tone: Type.Optional(Type.Union([
    Type.Literal('concise'),
    Type.Literal('detailed'),
    Type.Literal('casual'),
  ], { default: 'detailed' })),

  verbosity: Type.Optional(Type.Union([
    Type.Literal('minimal'),
    Type.Literal('normal'),
    Type.Literal('verbose'),
  ], { default: 'normal' })),

  shortcuts: Type.Optional(Type.Record(
    Type.String(),
    Type.String(),
    { maxProperties: 50 }
  )),

  behavioralRules: Type.Optional(Type.Array(
    Type.String({ maxLength: 500 }),
    { maxItems: 20 }
  )),

  defaultMode: Type.Optional(Type.String({ default: 'personal' })),

  notificationPreferences: Type.Optional(Type.Object({
    statusUpdates: Type.Boolean({ default: true }),
    errorAlerts: Type.Boolean({ default: true }),
  })),
}, { additionalProperties: false });

type UserPreferences = Static<typeof UserPreferencesSchema>;

class PreferencesManager {
  private userDir: string;
  private prefsPath: string;

  constructor(userId: string) {
    this.userDir = path.join(os.homedir(), '.jarvis/users', userId);
    this.prefsPath = path.join(this.userDir, 'preferences.json');
  }

  // Load preferences with defaults
  async load(): Promise<UserPreferences> {
    try {
      const content = await fs.readFile(this.prefsPath, 'utf8');
      const raw = JSON.parse(content);

      // Validate against schema
      if (!Value.Check(UserPreferencesSchema, raw)) {
        const errors = [...Value.Errors(UserPreferencesSchema, raw)];
        console.warn('[preferences] Validation errors:', errors);

        // Return defaults on validation failure
        return Value.Default(UserPreferencesSchema, {}) as UserPreferences;
      }

      return raw as UserPreferences;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // Return defaults if file doesn't exist
        return Value.Default(UserPreferencesSchema, {}) as UserPreferences;
      }
      throw err;
    }
  }

  // Save preferences atomically
  async save(prefs: UserPreferences): Promise<void> {
    // Validate before saving
    if (!Value.Check(UserPreferencesSchema, prefs)) {
      const errors = [...Value.Errors(UserPreferencesSchema, prefs)];
      throw new Error(`Invalid preferences schema: ${JSON.stringify(errors)}`);
    }

    // Check size
    const json = JSON.stringify(prefs, null, 2);
    const sizeKB = Buffer.byteLength(json) / 1024;
    if (sizeKB > 100) {
      console.warn(`[preferences] Large file warning: ${sizeKB.toFixed(1)}KB`);
    }

    // Atomic write via temp file
    await fs.mkdir(this.userDir, { recursive: true });
    const tempPath = `${this.prefsPath}.${Date.now()}.tmp`;

    try {
      await fs.writeFile(tempPath, json);
      await fs.rename(tempPath, this.prefsPath);
      console.log(`[preferences] Saved successfully (${sizeKB.toFixed(1)}KB)`);
    } catch (err) {
      // Cleanup temp file on failure
      await fs.unlink(tempPath).catch(() => {});
      throw err;
    }
  }

  // Get single preference value
  async get(key: keyof UserPreferences): Promise<unknown> {
    const prefs = await this.load();
    return prefs[key];
  }

  // Set single preference value
  async set(key: keyof UserPreferences, value: unknown): Promise<void> {
    const prefs = await this.load();
    const updated = { ...prefs, [key]: value };
    await this.save(updated);
  }

  // Get preferences as JSON Schema (for documentation)
  static getSchema(): Record<string, unknown> {
    return UserPreferencesSchema;
  }
}
```

### Gateway Mode Switching Handler

```typescript
// Source: Existing gateway/src/index.ts + mode reload logic
class Gateway {
  private orchestrator: AgentOrchestrator;

  private async handleIncoming(msg: Message, channel: Channel, defaultMode: string): Promise<void> {
    // Handle /mode command
    if (msg.text.startsWith('/mode')) {
      const parts = msg.text.split(/\s+/);

      if (parts.length === 1) {
        // List available modes
        const modes = this.orchestrator.getAvailableModes();
        const current = this.orchestrator.getCurrentMode();
        const response = `Current mode: ${current}\n\nAvailable modes:\n${modes.map(m => `- ${m}`).join('\n')}`;
        await channel.send(msg.sender, response);
        return;
      }

      const newMode = parts[1];

      try {
        const result = await this.orchestrator.switchMode(newMode);
        await channel.send(msg.sender, result);
      } catch (err) {
        await channel.send(msg.sender, `Error switching mode: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }

      return;
    }

    // Handle /preferences command
    if (msg.text.startsWith('/preferences')) {
      const prefsManager = new PreferencesManager(msg.sender);
      const prefs = await prefsManager.load();
      const response = `Your preferences:\n\`\`\`json\n${JSON.stringify(prefs, null, 2)}\n\`\`\``;
      await channel.send(msg.sender, response);
      return;
    }

    // Normal message handling
    const response = await this.orchestrator.handleMessage(msg);
    await channel.send(msg.sender, response.text);
  }
}
```

### Conversation History with Retention

```typescript
// Source: Existing pi-session.ts + retention logic
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

interface SessionMessage {
  timestamp: number;
  role: 'user' | 'assistant' | 'tool_result';
  content: string;
  toolName?: string;
  usage?: { inputTokens: number; outputTokens: number; model: string; cost: number };
}

class ConversationHistory {
  private sessionPath: string;
  private maxMessages: number;
  private maxAgeDays: number;
  private minMessages: number;

  constructor(
    userId: string,
    options: { maxMessages?: number; maxAgeDays?: number; minMessages?: number } = {}
  ) {
    const sessionDir = path.join(os.homedir(), '.jarvis/users', userId, 'sessions');
    this.sessionPath = path.join(sessionDir, 'messages.jsonl');

    this.maxMessages = options.maxMessages ?? 50;
    this.maxAgeDays = options.maxAgeDays ?? 30;
    this.minMessages = options.minMessages ?? 10;
  }

  async append(message: SessionMessage): Promise<void> {
    const dir = path.dirname(this.sessionPath);
    await fs.mkdir(dir, { recursive: true });

    const line = JSON.stringify(message) + '\n';
    await fs.appendFile(this.sessionPath, line);

    // Enforce retention policy after append
    await this.enforceRetention();
  }

  async load(limit?: number): Promise<SessionMessage[]> {
    try {
      const content = await fs.readFile(this.sessionPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);

      const messages: SessionMessage[] = [];
      for (const line of lines) {
        try {
          messages.push(JSON.parse(line));
        } catch {
          console.warn('[history] Skipping invalid line');
        }
      }

      return messages.slice(-(limit ?? this.maxMessages));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  private async enforceRetention(): Promise<void> {
    const messages = await this.load(Infinity);

    if (messages.length <= this.minMessages) {
      return;
    }

    const now = Date.now();
    const maxAgeMs = this.maxAgeDays * 24 * 60 * 60 * 1000;

    const kept = messages
      .filter(m => now - m.timestamp < maxAgeMs)
      .slice(-this.maxMessages);

    if (kept.length >= this.minMessages) {
      const finalKept = kept;

      if (finalKept.length < messages.length) {
        const tempPath = `${this.sessionPath}.${Date.now()}.tmp`;
        const content = finalKept.map(m => JSON.stringify(m)).join('\n') + '\n';

        await fs.writeFile(tempPath, content);
        await fs.rename(tempPath, this.sessionPath);

        console.log(`[history] Retention: ${messages.length} → ${finalKept.length} messages`);
      }
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual JSON parsing | TypeBox + ajv validation | 2024-2025 (TypeBox 0.30+) | Runtime validation, type inference, JSON Schema generation, prevents invalid data |
| Synchronous fs operations | fs.promises async/await | Node.js 10+ | Non-blocking I/O, better performance, modern async patterns |
| Single global config | Hierarchical config with precedence | Pi-mono 0.50+ (2024) | Project overrides, CLI flags, environment variables, flexible configuration |
| In-memory only preferences | Persistent JSON with atomic writes | Standard practice | Survives restarts, audit trail, version control friendly |
| Unlimited conversation history | Retention policies with cleanup | Agent frameworks 2024+ | Prevents unbounded growth, manages costs, maintains recent context |
| Process restart for config changes | Hot-reload with new Agent instances | Modern agent frameworks 2025+ | Zero-downtime config updates, faster iteration, better UX |

**Deprecated/outdated:**
- Synchronous fs.readFileSync/writeFileSync in production: Use fs.promises for non-blocking I/O
- JSON.stringify without try/catch: Validation before serialization prevents runtime errors
- Global mutable state for config: Immutable config snapshots per session prevent race conditions
- Environment variables for user preferences: Use JSON files for structured, versioned, auditable preferences

## Open Questions

Things that couldn't be fully resolved:

1. **Preference Confirmation UI in Telegram**
   - What we know: Pi-mono Extensions have `ctx.ui.confirm()` for interactive prompts
   - What's unclear: Whether Telegram channel supports interactive confirmation or needs custom implementation (inline keyboard buttons vs text confirmation)
   - Recommendation: Start with text confirmation ("Reply 'yes' to confirm"). Investigate Telegram inline keyboard buttons for Phase 4 if better UX needed.

2. **Retention Policy Trigger Frequency**
   - What we know: Cleanup on every append prevents unbounded growth but adds overhead
   - What's unclear: Optimal trigger frequency for personal assistant scale (10-100 messages/day). Daily cron vs on-write vs size-based threshold?
   - Recommendation: Start with on-write cleanup (simple, immediate). Add daily cron in Phase 4 if performance issues emerge (unlikely at personal scale).

3. **Mode Config Reload Atomicity**
   - What we know: Reload all mode configs from disk on `/mode` command
   - What's unclear: What if mode config file is being edited during reload? Partial read risk?
   - Recommendation: Use same atomic read pattern as preferences (fs.promises, validate after parse). Config files rarely edited manually, low risk.

4. **Preference Schema Versioning**
   - What we know: TypeBox schemas define structure, but no versioning mechanism
   - What's unclear: How to handle schema evolution (adding new fields, removing old fields, migrations)?
   - Recommendation: Add `schemaVersion` field to preferences. Check version on load, apply migrations if needed. Document breaking changes in Phase 4.

5. **Multi-User Preference Isolation**
   - What we know: Preferences stored per userId (~/.jarvis/users/<userId>/preferences.json)
   - What's unclear: How to isolate preferences when multiple Telegram users access same bot (if expanded beyond single user)?
   - Recommendation: Current single-user architecture is sufficient for Phase 3. Multi-user support deferred to v2 (out of scope).

## Sources

### Primary (HIGH confidence)

**Pi-mono Settings System:**
- [Settings and Configuration | badlogic/pi-mono | DeepWiki](https://deepwiki.com/badlogic/pi-mono/4.13-settings-and-configuration) - Hierarchical config, atomic writes, precedence rules, SettingsManager architecture
- [pi-mono/packages/coding-agent/README.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md) - Settings file locations, CLI flags, TUI commands

**TypeBox and Validation:**
- [GitHub - sinclairzx81/typebox](https://github.com/sinclairzx81/typebox) - Official TypeBox repository, 7.5k+ stars
- [TypeBox | feathers](https://feathersjs.com/api/schema/typebox) - TypeBox usage patterns, schema validation
- [Using with TypeScript | Ajv JSON schema validator](https://ajv.js.org/guide/typescript.html) - Ajv + TypeScript integration

**Agent Memory and Persistence:**
- [Agent Chat History and Memory | Microsoft Learn](https://learn.microsoft.com/en-us/agent-framework/user-guide/agents/agent-memory) - Retention policies, persistence strategies
- [Conversation History and Persistence | openai/codex | DeepWiki](https://deepwiki.com/openai/codex/3.3-session-management-and-persistence) - JSONL format for session persistence

### Secondary (MEDIUM confidence)

**Configuration Management:**
- [Configuration Management for TypeScript Node.js Apps | Medium](https://medium.com/@andrei-trukhin/configuration-management-for-typescript-node-js-apps-60b6c99d6331) - Best practices for TypeScript config systems
- [GitHub - creditkarma/dynamic-config](https://github.com/creditkarma/dynamic-config) - Dynamic config library for Node.js

**Schema Validation Best Practices:**
- [Typescript To Json Schema Best Practices | Restackio](https://www.restack.io/p/typescript-answer-json-schema-best-practices) - Validation patterns, versioning, documentation
- [Beginner's Guide to TypeBox | Better Stack Community](https://betterstack.com/community/guides/scaling-nodejs/typebox-explained/) - TypeBox usage guide, runtime validation

### Tertiary (LOW confidence)

**Hot Reload and Runtime Updates:**
- [Watch Mode - Bun](https://bun.com/docs/runtime/watch-mode) - Hot reload patterns in Bun (not directly applicable to Node.js but illustrates concepts)
- [Complete Guide to Cursor Agent Mode (2026)](https://eastondev.com/blog/en/posts/dev/20260110-cursor-agent-complete-guide/) - Mode switching in AI agents (generic patterns)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - TypeBox already in use, pi-mono patterns proven, Node.js fs is built-in
- Architecture: HIGH - Pi-mono SettingsManager demonstrates exact patterns needed (hierarchical config, atomic writes, precedence)
- Pitfalls: HIGH - Memory poisoning, file corruption, race conditions documented in security research and pi-mono issues
- Code examples: HIGH - Adapted from pi-mono source and TypeBox documentation, tested patterns
- Open questions: MEDIUM - Preference UI and retention triggers need validation during implementation

**Research date:** 2026-02-06
**Valid until:** 2026-03-06 (30 days - TypeBox and Node.js fs patterns are stable, pi-mono actively maintained)

---

## Ready for Planning

Research complete. Key findings:
1. **Stack is proven**: TypeBox + ajv for validation, pi-mono settings patterns, Node.js fs for I/O
2. **Infrastructure exists**: JSONL persistence from Phase 1, mode configs in place, TypeBox from Phase 2
3. **Patterns are documented**: Hierarchical config, atomic writes, retention policies, hot-reload
4. **Pitfalls are known**: Memory poisoning, file corruption, race conditions, unbounded growth - all mitigable
5. **Open questions are minor**: Confirmation UI and retention triggers need validation but won't block progress

Planner can now create detailed PLAN.md files for the two sub-phases:
- **03-01-PLAN.md**: Add persistent preferences (MEMR-01, MEMR-02, MEMR-03)
- **03-02-PLAN.md**: Enable dynamic mode switching (MODE-01, MODE-02, MODE-03) + conversation history retention (MEMR-04)
