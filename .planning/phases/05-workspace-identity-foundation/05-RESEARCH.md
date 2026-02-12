# Phase 5: Workspace & Identity Foundation - Research

**Researched:** 2026-02-12
**Domain:** File-based workspace structure, identity system, data migration
**Confidence:** MEDIUM-HIGH

## Summary

Phase 5 establishes a persistent, file-based workspace following OpenClaw conventions with SOUL.md identity, predictable directory structure, and v1.0 data migration. Research reveals that file-based identity systems are well-established (OpenClaw, Moltbot, Claude Code), but they introduce serious prompt injection risks that require explicit security mitigations. The workspace pattern is straightforward: markdown files for identity/memory, Git for audit trails, and atomic writes for safety.

**Key insight:** SOUL.md security is non-negotiable. Researchers demonstrated persistent prompt injection attacks that survive restarts by modifying identity files. Defense requires file immutability, semantic diff validation, and explicit user confirmation for all SOUL.md changes.

**Primary recommendation:** Use proven TypeScript patterns (TypeBox validation, atomic writes with temp files, simple-git for commits) and implement security from day one with baseline semantic checks and read-only SOUL.md operations.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeBox | 0.38+ | Runtime JSON schema validation | Already in use (preferences.ts), faster than Zod, native JSON Schema support |
| simple-git | 3.x | Git operations in Node.js | Lightweight, TypeScript-first, active maintenance, widely used for automated commits |
| Node.js fs | Built-in | File operations | Atomic writes via temp + rename pattern, sufficient for local workspace |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| isomorphic-git | 1.27+ | Pure JS git implementation | Alternative to simple-git if native git not guaranteed on deployment |
| chokidar | 3.x | File watching | Optional for auto-indexing memory files on write (Phase 6/7) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| simple-git | execSync('git ...') | Already used in v1.0 codebase, works but no error handling or parsing |
| simple-git | isomorphic-git | Pure JS (no git binary required), but larger bundle and more complex API |
| TypeBox | Zod | More popular but slower runtime performance, larger bundle |

**Installation:**
```bash
pnpm add simple-git @sinclair/typebox
# TypeBox already installed (used in preferences.ts)
# simple-git is new dependency
```

## Architecture Patterns

### Recommended Workspace Structure
```
~/.jarvis/workspace/
├── SOUL.md              # Agent identity (personality, boundaries, continuity)
├── MEMORY.md            # Curated long-term memory (DM only, Phase 6)
├── memory/              # Daily append-only logs (Phase 6)
│   ├── 2026-02-10.md
│   ├── 2026-02-11.md
│   └── 2026-02-12.md
├── sessions/            # Migrated from ~/.jarvis/sessions/
│   ├── {userId}/
│   │   └── messages.jsonl
│   └── cron:{jobName}/
│       └── messages.jsonl
├── preferences/         # Migrated from ~/.jarvis/users/{userId}/
│   └── {userId}.json
├── .git/                # Git repo for audit trail
└── .gitignore           # Exclude sessions/ (logs too chatty), include SOUL.md
```

**Rationale:**
- **SOUL.md at workspace root:** Follows OpenClaw convention, loaded first at session start
- **sessions/ and preferences/ subdirs:** Separation of concerns (identity vs state vs memory)
- **Git tracking:** SOUL.md, MEMORY.md, memory/*.md are tracked; sessions/ excluded (too noisy)
- **XDG compliance:** Could use `~/.config/jarvis/` but `~/.jarvis/` is simpler and already established in v1.0

### Pattern 1: SOUL.md Loading
**What:** Read SOUL.md at every agent session start and inject into system prompt
**When to use:** Every Claude Code SDK or Pi session creation
**Example:**
```typescript
// Source: OpenClaw identity architecture (MMNTM article)
// and existing preferences.ts pattern

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

export class WorkspaceManager {
  private workspaceDir: string;
  private soulPath: string;

  constructor() {
    this.workspaceDir = resolve(homedir(), ".jarvis", "workspace");
    this.soulPath = resolve(this.workspaceDir, "SOUL.md");
  }

  loadSoul(): string {
    if (!existsSync(this.soulPath)) {
      // Return default SOUL.md if not yet created
      return this.getDefaultSoul();
    }

    try {
      return readFileSync(this.soulPath, "utf-8");
    } catch (err) {
      console.error("[workspace] Failed to load SOUL.md:", err);
      return this.getDefaultSoul();
    }
  }

  // Inject SOUL.md into system prompt
  buildSystemPrompt(basePrompt: string): string {
    const soul = this.loadSoul();
    return `${soul}\n\n---\n\n${basePrompt}`;
  }

  private getDefaultSoul(): string {
    return `# Jarvis Soul

## Who I Am
A personal AI assistant for Ike. Direct, casual, helpful.

## Communication Style
- Be concise unless asked for detail
- Use plain language, avoid corporate speak
- Show work when problem-solving

## Boundaries
- Never write to SOUL.md without explicit user confirmation
- Always ask before destructive operations
- Respect privacy: don't store sensitive data in memory logs
`;
  }
}
```

### Pattern 2: Atomic File Writes with Validation
**What:** Write to temp file, validate, then rename atomically (POSIX guarantee)
**When to use:** All workspace file modifications (SOUL.md, MEMORY.md, preferences)
**Example:**
```typescript
// Source: packages/core/src/preferences.ts (v1.0)
// and packages/core/src/config-manager.ts (v1.0)

import { writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { Value } from "@sinclair/typebox/value";

export function atomicWrite(
  path: string,
  content: string,
  schema?: any,
  data?: any
): void {
  // Validate if schema provided
  if (schema && data) {
    if (!Value.Check(schema, data)) {
      const errors = [...Value.Errors(schema, data)];
      const errorSummary = errors
        .slice(0, 5)
        .map(err => `${err.path}: ${err.message}`)
        .join("; ");
      throw new Error(`Validation failed: ${errorSummary}`);
    }
  }

  // Ensure parent directory exists
  const dir = path.substring(0, path.lastIndexOf("/"));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Atomic write via temp file
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, content, "utf-8");
  renameSync(tempPath, path); // POSIX atomic operation

  console.log(`[workspace] Wrote ${path} (${Buffer.byteLength(content)} bytes)`);
}
```

### Pattern 3: Git Auto-Commit with Best-Effort
**What:** Commit SOUL.md changes with timestamp, fail gracefully if git unavailable
**When to use:** After confirmed SOUL.md modifications
**Example:**
```typescript
// Source: simple-git docs and OpenClaw audit trail pattern

import simpleGit from "simple-git";
import { resolve } from "node:path";

export class WorkspaceGit {
  private git: ReturnType<typeof simpleGit>;
  private workspaceDir: string;

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
    this.git = simpleGit(workspaceDir);
  }

  async initRepo(): Promise<void> {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        await this.git.init();
        await this.git.add(".gitignore");
        await this.git.commit("Initial workspace setup");
        console.log("[workspace] Initialized git repo");
      }
    } catch (err) {
      console.warn("[workspace] Git init failed (non-fatal):", err);
    }
  }

  async commitSoul(message?: string): Promise<void> {
    try {
      await this.git.add("SOUL.md");
      const timestamp = new Date().toISOString();
      const commitMsg = message || `Update SOUL.md - ${timestamp}`;
      await this.git.commit(commitMsg);
      console.log("[workspace] Committed SOUL.md:", commitMsg);
    } catch (err) {
      console.warn("[workspace] Git commit failed (non-fatal):", err);
    }
  }

  // Get diff for security validation
  async getDiff(file: string): Promise<string> {
    try {
      return await this.git.diff([file]);
    } catch (err) {
      console.warn("[workspace] Git diff failed:", err);
      return "";
    }
  }
}
```

### Pattern 4: v1.0 Data Migration
**What:** Move existing sessions and preferences to new workspace structure without data loss
**When to use:** One-time migration at workspace initialization
**Example:**
```typescript
// Source: TypeScript migration best practices and backward compatibility patterns

import { existsSync, readdirSync, copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

export async function migrateV1Data(): Promise<void> {
  const oldRoot = resolve(homedir(), ".jarvis");
  const newWorkspace = resolve(oldRoot, "workspace");

  // Create new workspace structure
  mkdirSync(newWorkspace, { recursive: true });
  mkdirSync(resolve(newWorkspace, "sessions"), { recursive: true });
  mkdirSync(resolve(newWorkspace, "preferences"), { recursive: true });
  mkdirSync(resolve(newWorkspace, "memory"), { recursive: true });

  // Migrate sessions: ~/.jarvis/sessions/{userId}/ -> workspace/sessions/{userId}/
  const oldSessions = resolve(oldRoot, "sessions");
  if (existsSync(oldSessions)) {
    const userDirs = readdirSync(oldSessions);
    for (const userId of userDirs) {
      const oldSessionDir = resolve(oldSessions, userId);
      const newSessionDir = resolve(newWorkspace, "sessions", userId);

      if (!existsSync(newSessionDir)) {
        mkdirSync(newSessionDir, { recursive: true });
      }

      // Copy messages.jsonl
      const oldLog = resolve(oldSessionDir, "messages.jsonl");
      const newLog = resolve(newSessionDir, "messages.jsonl");
      if (existsSync(oldLog) && !existsSync(newLog)) {
        copyFileSync(oldLog, newLog);
        console.log(`[migrate] Copied session log for ${userId}`);
      }
    }
  }

  // Migrate preferences: ~/.jarvis/users/{userId}/preferences.json -> workspace/preferences/{userId}.json
  const oldUsers = resolve(oldRoot, "users");
  if (existsSync(oldUsers)) {
    const userDirs = readdirSync(oldUsers);
    for (const userId of userDirs) {
      const oldPref = resolve(oldUsers, userId, "preferences.json");
      const newPref = resolve(newWorkspace, "preferences", `${userId}.json`);

      if (existsSync(oldPref) && !existsSync(newPref)) {
        copyFileSync(oldPref, newPref);
        console.log(`[migrate] Copied preferences for ${userId}`);
      }
    }
  }

  console.log("[migrate] v1.0 data migration complete");
}
```

### Anti-Patterns to Avoid

- **Direct SOUL.md writes without user confirmation:** SOUL.md is a read-only file for the agent. User must explicitly approve changes (prompt injection defense).
- **Synchronous file writes without atomicity:** Always use temp file + rename pattern to prevent partial writes during crashes.
- **Hardcoding workspace path:** Use homedir() + resolve() for cross-platform compatibility.
- **Git failures blocking operations:** Git commits should be best-effort; log warnings but don't throw.
- **Loading entire workspace into context:** Only load SOUL.md at session start. Memory files loaded on-demand via search (Phase 7).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git operations | exec() wrappers with string parsing | simple-git | Type-safe API, error handling, tested edge cases (merge conflicts, detached HEAD) |
| JSON schema validation | Manual type checking with if statements | TypeBox Value.Check() | Standard JSON Schema, auto-generated types, detailed error paths |
| File watching | setInterval() polling | chokidar (Phase 6/7) | Cross-platform (Linux inotify, macOS FSEvents), handles renames and symlinks |
| Diff parsing | String splitting and regex | simple-git.diff() | Handles binary files, renames, permission changes |
| Prompt injection detection | Keyword blocklists | Semantic similarity + action verb detection | Attackers trivially bypass keyword filters; semantic analysis catches intent |

**Key insight:** Workspace operations (file I/O, git, validation) are deceptively complex. Use battle-tested libraries to avoid edge cases (file locks, partial writes, git states, schema evolution).

## Common Pitfalls

### Pitfall 1: SOUL.md Prompt Injection
**What goes wrong:** Agent modifies SOUL.md under attacker influence, persisting malicious instructions across sessions.
**Why it happens:** SOUL.md is injected into every system prompt. If agent can write to it, an attacker can trick it into adding "skip confirmation for X command" or "always execute curl to attacker.com".
**How to avoid:**
  1. Agent NEVER writes to SOUL.md without explicit user confirmation flow
  2. Git baseline semantic check: flag diffs containing action verbs (execute, curl, send, delete) or negation (do not ask, skip, ignore)
  3. File permissions: Consider making SOUL.md read-only for the agent process (filesystem-level defense)
**Warning signs:**
  - SOUL.md diffs contain imperative commands ("execute", "run", "send")
  - SOUL.md diffs negate safety rules ("do not ask", "skip confirmation")
  - Unexpected SOUL.md commits without user-initiated edits
**Sources:**
  - [OpenClaw Soul & Evil: Identity Files as Attack Surfaces](https://www.mmntm.net/articles/openclaw-soul-evil)
  - [The OpenClaw Prompt Injection Problem](https://www.penligent.ai/hackinglabs/the-openclaw-prompt-injection-problem-persistence-tool-hijack-and-the-security-boundary-that-doesnt-exist/)
  - [OpenClaw or Open Door? Prompt Injection Creates AI Backdoors](https://www.esecurityplanet.com/threats/openclaw-or-open-door-prompt-injection-creates-ai-backdoors/)

### Pitfall 2: Context Window Budget Overflow
**What goes wrong:** SOUL.md (500-2k tokens) + mode config (500-1k) + tool definitions (2k-10k) + memory search results (1k-5k) exceed context window, causing truncation or API errors.
**Why it happens:** No explicit budget allocation. Components independently grow until they collide.
**How to avoid:**
  1. Define explicit token budgets from day one:
     - SOUL.md: max 2k tokens (enforce with character limit ~8k chars)
     - Mode config system prompt: max 1k tokens
     - Tool definitions: budget varies by surface (MCP text: 5k, voice: 2k)
     - Memory search: configurable limit (default 3k tokens, ~10-15 snippets)
  2. Measure token usage with model's tokenizer (Anthropic SDK has count_tokens)
  3. Fail fast with clear error if budget exceeded: "SOUL.md too large (2500 tokens, max 2000)"
  4. Use truncation strategies: memory search returns top-k results by relevance score
**Warning signs:**
  - Agent responses suddenly truncated mid-sentence
  - API errors: "maximum context length exceeded"
  - Agent forgets recent context despite memory search working
**Sources:**
  - [Context Window Overflow in 2026: Fix LLM Errors Fast](https://redis.io/blog/context-window-overflow/)
  - [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
  - [Context Window Management: Strategies for Long-Context AI Agents](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/)

### Pitfall 3: Race Conditions in Data Migration
**What goes wrong:** Migration runs while agent is active, causing partial state (old preferences path, new sessions path).
**Why it happens:** Migration is one-time, but agent might be running in background (systemd service).
**How to avoid:**
  1. Migration must be idempotent: check if new structure exists, skip if already migrated
  2. Use existence checks: if workspace/sessions/{userId}/ exists, don't copy from old location
  3. Copy (don't move) v1.0 data: old files remain as backup until user confirms migration success
  4. Log migration actions clearly: "Migrated 3 session logs, 2 preference files"
  5. Add migration timestamp marker: workspace/.migrated-from-v1 with date
**Warning signs:**
  - Duplicate session logs (one in old location, one in new)
  - Preferences reset to defaults after migration
  - Agent reads from old location while writing to new location
**Sources:**
  - [Data Engineering: Data Serialization, backward and forward compatibility](https://c-nemri.medium.com/data-engineering-explained-data-serialization-backward-and-forward-compatibility-c828fda0791)
  - [TypeScript Migration](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html)

### Pitfall 4: Git Repository State Confusion
**What goes wrong:** Workspace becomes a git repo, but agent tries to use git commands for OTHER repos (coding projects), causing "not a git repository" errors or committing to wrong repo.
**Why it happens:** simple-git defaults to cwd, and agent cwd varies by operation.
**How to avoid:**
  1. WorkspaceGit class explicitly binds to workspace directory: `simpleGit(workspaceDir)`
  2. Coding operations (Phase 8+) use separate git instance: `simpleGit(projectCwd)`
  3. Never rely on process.cwd() for git operations — always pass explicit path
  4. Log git operations clearly: "[workspace-git] Committed SOUL.md" vs "[project-git] Committed feature"
**Warning signs:**
  - "fatal: not a git repository" errors when workspace exists
  - SOUL.md commits appearing in user's coding projects
  - Git operations affecting wrong directory
**Sources:**
  - [simple-git - npm](https://www.npmjs.com/package/simple-git)
  - [Git Best Practices](https://www.w3schools.com/git/git_best_practices.asp)

## Code Examples

Verified patterns from existing codebase and research:

### Loading Preferences (Existing v1.0 Pattern)
```typescript
// Source: packages/core/src/preferences.ts (lines 99-154)
// This pattern will be adapted for SOUL.md

load(): UserPreferences {
  if (this.preferences !== null) {
    return this.preferences; // Cached
  }

  if (!existsSync(this.preferencesDir)) {
    mkdirSync(this.preferencesDir, { recursive: true });
  }

  if (existsSync(this.preferencesPath)) {
    try {
      const rawContent = readFileSync(this.preferencesPath, "utf-8");
      const parsed = JSON.parse(rawContent);

      // Apply defaults for missing fields
      const withDefaults = Value.Default(UserPreferencesSchema, parsed);

      // Validate against schema
      if (!Value.Check(UserPreferencesSchema, withDefaults)) {
        const errors = [...Value.Errors(UserPreferencesSchema, withDefaults)];
        console.error(`[preferences] Validation errors:`, errors);
        return this.getDefaults();
      }

      this.preferences = withDefaults;
      return withDefaults;
    } catch (err) {
      console.error(`[preferences] Failed to load:`, err);
      return this.getDefaults();
    }
  }

  return this.getDefaults();
}
```

### Atomic Write with Rollback (Existing v1.0 Pattern)
```typescript
// Source: packages/core/src/config-manager.ts (lines 56-98)
// This pattern will be used for SOUL.md writes (with user confirmation)

async addCronJob(modeName: string, cronJob: CronJobConfig): Promise<void> {
  const configPath = resolve(this.configDir, `${modeName}.json`);

  if (!existsSync(configPath)) {
    throw new Error(`Mode config '${modeName}' not found`);
  }

  const backupPath = `${configPath}.backup`;
  const currentContent = readFileSync(configPath, "utf-8");
  writeFileSync(backupPath, currentContent, "utf-8");

  try {
    const config = JSON.parse(currentContent) as ModeConfig;
    config.crons.push(cronJob);

    // Validate before saving
    if (!Value.Check(ModeConfigSchema, config)) {
      const errors = [...Value.Errors(ModeConfigSchema, config)];
      throw new Error(`Validation failed: ${errors}`);
    }

    // Atomic write
    const tempPath = `${configPath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(config, null, 2), "utf-8");
    renameSync(tempPath, configPath);
    unlinkSync(backupPath);

    console.log(`[config] Added cron job '${cronJob.name}'`);
  } catch (err) {
    if (existsSync(backupPath)) {
      renameSync(backupPath, configPath); // Rollback
      console.error(`[config] Rolled back changes`);
    }
    throw err;
  }
}
```

### Git Initialization (simple-git)
```typescript
// Source: https://www.npmjs.com/package/simple-git
// and https://github.com/steveukx/git-js

import simpleGit from "simple-git";

const git = simpleGit(workspaceDir);

// Check if already a repo
const isRepo = await git.checkIsRepo();
if (!isRepo) {
  await git.init();

  // Create .gitignore
  writeFileSync(
    resolve(workspaceDir, ".gitignore"),
    "sessions/\npreferences/\n*.tmp\n*.backup\n",
    "utf-8"
  );

  await git.add(".gitignore");
  await git.add("SOUL.md");
  await git.commit("Initial workspace setup");
}

// Commit a file
await git.add("SOUL.md");
await git.commit("Update personality boundaries");

// Get diff for validation
const diff = await git.diff(["SOUL.md"]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded personality in system prompt | SOUL.md identity file with git tracking | 2025 (OpenClaw v1.0) | User-editable agent personality, version control, audit trail |
| Database-backed memory | File-based markdown memory with semantic search | 2025 (OpenClaw, Moltbot) | Transparency (plain text), portability, git-friendly, no vendor lock-in |
| Global workspace (~/.config/app/) | Project-aware workspace (follows XDG or app convention) | 2024-2025 | Better organization, multi-agent support, per-user separation |
| Manual git commits | Automated git commits with timestamp messages | 2025-2026 | Audit trail for compliance, debugging, rollback capability |
| TypeScript with Zod | TypeScript with TypeBox | 2024-2025 | Faster runtime validation (10-100x), smaller bundles, native JSON Schema |

**Deprecated/outdated:**
- **Database for agent memory:** Vector DBs (Pinecone, Weaviate) are overkill for single-user agents. SQLite + sqlite-vec is sufficient for embeddings, markdown files for storage.
- **Complex workspace layouts:** Early OpenClaw versions had deeply nested directories (workspace/agents/{agent}/sessions/{session}/...). Flattened structure is clearer.
- **Pre-commit hooks for validation:** Use runtime validation (TypeBox) instead. Pre-commit hooks don't prevent runtime corruption.

## Open Questions

1. **SOUL.md size limit enforcement**
   - What we know: Should cap at ~2k tokens to fit in context budget
   - What's unclear: Should we enforce character limit (soft) or token limit (accurate but requires tokenizer)? Error or truncate?
   - Recommendation: Start with character limit (~8k chars ≈ 2k tokens), log warning above threshold, hard error above 12k chars

2. **Workspace initialization timing**
   - What we know: Migration must happen before first agent session
   - What's unclear: Should migration be automatic on first run, or require explicit user command?
   - Recommendation: Automatic on first run with clear logging. Add `jarvis migrate-workspace` CLI command for manual trigger.

3. **SOUL.md schema validation**
   - What we know: SOUL.md is freeform markdown, no fixed schema
   - What's unclear: Should we enforce sections (## Who I Am, ## Boundaries) or allow any structure?
   - Recommendation: No schema enforcement. SOUL.md is human-written, agent-read. Let user organize freely. Provide template on first init.

4. **Git conflicts during concurrent modifications**
   - What we know: Multiple agents (text, voice, iOS) might trigger SOUL.md commits simultaneously
   - What's unclear: How to handle git conflicts if two surfaces try to commit at same time?
   - Recommendation: Phase 5 only has text agent (Telegram). Defer conflict resolution to Phase 8 (multi-surface tool API).

5. **Backward compatibility verification**
   - What we know: Preferences schema uses TypeBox with additionalProperties: false
   - What's unclear: What if v1.0 preferences.json has unknown keys? Drop silently or warn?
   - Recommendation: Log warning for unknown keys but don't fail. Value.Check() will filter them out.

## Sources

### Primary (HIGH confidence)
- [OpenClaw Agent Workspace - Official Docs](https://docs.openclaw.ai/concepts/agent-workspace) - Workspace structure and conventions
- [How OpenClaw Implements Agent Identity: Soul, Persona, Multi-Agent](https://www.mmntm.net/articles/openclaw-identity-architecture) - SOUL.md and IDENTITY.md patterns
- [TypeBox GitHub - JSON Schema Type Builder](https://github.com/sinclairzx81/typebox) - Validation library API and patterns
- [simple-git npm](https://www.npmjs.com/package/simple-git) - Git operations API
- [OpenClaw Memory Architecture](https://zenvanriel.nl/ai-engineer-blog/openclaw-memory-architecture-guide/) - Daily logs and long-term memory structure

### Secondary (MEDIUM confidence)
- [OpenClaw Soul & Evil: Identity Files as Attack Surfaces](https://www.mmntm.net/articles/openclaw-soul-evil) - SOUL.md security risks and mitigations
- [The OpenClaw Prompt Injection Problem](https://www.penligent.ai/hackinglabs/the-openclaw-prompt-injection-problem-persistence-tool-hijack-and-the-security-boundary-that-doesnt-exist/) - Persistence attack mechanisms
- [Context Window Management: Strategies for Long-Context AI Agents](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/) - Budget allocation strategies
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) - Anthropic official guidance
- [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/latest/) - Workspace directory conventions

### Tertiary (LOW confidence)
- [TypeScript Migration](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html) - General migration patterns (not specific to this use case)
- [Git Best Practices](https://www.w3schools.com/git/git_best_practices.asp) - General git guidance (not agent-specific)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - TypeBox and simple-git are well-established, already using TypeBox in v1.0
- Architecture: HIGH - OpenClaw workspace pattern is proven with real-world usage
- Pitfalls: HIGH - SOUL.md prompt injection extensively documented by security researchers
- Context budget: MEDIUM - Strategies clear but jarvis-specific budget allocation requires experimentation

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days - stable domain, no fast-moving dependencies)

**Codebase context:**
- Existing patterns: preferences.ts (atomic writes, TypeBox validation), config-manager.ts (rollback on error)
- v1.0 data locations: ~/.jarvis/sessions/{userId}/messages.jsonl, ~/.jarvis/users/{userId}/preferences.json
- Current stack: TypeScript, pnpm, Node.js 22+, TypeBox already installed
- No git library currently — simple-git is new dependency
