# Phase 6: Memory Persistence - Research

**Researched:** 2026-02-12
**Domain:** File-based memory persistence, daily logs, automatic indexing
**Confidence:** HIGH

## Summary

Phase 6 implements durable file-based memory storage for the agent following the workspace foundation from Phase 5. Research reveals that memory persistence in 2026 LLM agents uses two-tier systems: curated long-term memory (MEMORY.md) for stable facts, and episodic daily logs for temporal context. The key pattern is append-only operations with file watchers triggering automatic indexing (Phase 7 will consume the index). Modern agent architectures (A-MEM, SimpleMem) emphasize self-contained memory units with resolved coreferences and absolute timestamps to enable effective cross-session retrieval.

**Key insight:** Memory persistence is just storage + hooks for indexing. Phase 6 does NOT implement search — that's Phase 7. This phase provides: (1) tools for agents to write durable facts, (2) automatic daily log creation with timestamps, (3) session-start loading of recent context, and (4) file watcher hooks that trigger reindexing when memory files change.

**Primary recommendation:** Use proven patterns from Phase 5 (atomic writes, WorkspaceManager, git commits) and add three memory tools: `memory_append` (add facts to MEMORY.md), `memory_log` (write to today's daily log), and `memory_load_recent` (internal: auto-load yesterday + today at session start). Use chokidar for file watching with debouncing to trigger Phase 7's indexer.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js fs | Built-in | File I/O for memory files | Atomic writes via temp + rename (already proven in Phase 5) |
| chokidar | 5.x | File watching for auto-indexing | Cross-platform (FSEvents, inotify), handles atomic writes correctly, debouncing built-in |
| Node.js path | Built-in | Date-based file paths (YYYY-MM-DD.md) | ISO 8601 compliant, sorts correctly, unambiguous |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| WorkspaceManager | (Phase 5) | Workspace paths and atomic writes | Already exists, reuse for memory file operations |
| WorkspaceGit | (Phase 5) | Git commits for memory audit trail | Commit MEMORY.md changes, daily logs can be gitignored (too noisy) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chokidar | fs.watch | chokidar handles edge cases (atomic writes, symlinks, renames) that raw fs.watch misses |
| Append to MEMORY.md | Separate MEMORY/ folder with fact files | Single MEMORY.md is simpler to read/search; multi-file requires indexing anyway |
| Daily logs in flat dir | Nested year/month dirs (2026/02/12.md) | Flat is simpler; filesystem handles 365+ files fine, glob patterns work |

**Installation:**
```bash
# Phase 5 already added simple-git
pnpm add chokidar
```

## Architecture Patterns

### Recommended Memory Structure (extends Phase 5 workspace)
```
~/.jarvis/workspace/
├── SOUL.md              # Phase 5: Agent identity
├── MEMORY.md            # Phase 6: Curated long-term facts
├── memory/              # Phase 6: Daily episodic logs
│   ├── 2026-02-10.md
│   ├── 2026-02-11.md
│   └── 2026-02-12.md
├── sessions/            # Phase 5: Session transcripts (not memory)
├── preferences/         # Phase 5: User preferences
├── .git/                # Phase 5: Audit trail
└── .gitignore           # Phase 5+6: Exclude sessions/, optionally memory/
```

**Rationale:**
- **MEMORY.md vs memory/ split**: MEMORY.md = durable facts agent actively maintains (git tracked). memory/ = append-only daily logs (optionally git tracked, tends to be noisy).
- **YYYY-MM-DD.md naming**: ISO 8601 compliant, sorts correctly in file browsers and glob results, unambiguous across locales.
- **Flat memory/ directory**: No nested year/month structure. Daily logs are cheap to glob (`memory/*.md`), filesystem handles hundreds of files efficiently.
- **Git tracking**: MEMORY.md committed on user confirmation. Daily logs can be gitignored (too noisy) or tracked (creates audit trail). Decision: track for now, evaluate noise later.

### Pattern 1: MEMORY.md Append Operation
**What:** Agent writes curated facts to MEMORY.md with timestamp and confirmation
**When to use:** User says "remember X" or agent learns something durable
**Example:**
```typescript
// Tool: memory_append
// Source: Phase 5 atomicWrite pattern + A-MEM self-contained memory units

import { WorkspaceManager } from "./workspace.js";
import { WorkspaceGit } from "./workspace-git.js";
import { readFileSync, existsSync } from "node:fs";

export async function memoryAppend(
  fact: string,
  category?: string
): Promise<string> {
  const workspace = new WorkspaceManager();
  const workspaceGit = new WorkspaceGit(workspace.getWorkspaceDir());
  const memoryPath = workspace.getMemoryPath();

  // Load current MEMORY.md
  let content = "";
  if (existsSync(memoryPath)) {
    content = readFileSync(memoryPath, "utf-8");
  }

  // Append new fact with timestamp (self-contained unit)
  const timestamp = new Date().toISOString();
  const categoryTag = category ? ` [${category}]` : "";
  const entry = `\n## ${timestamp}${categoryTag}\n\n${fact}\n`;
  const newContent = content + entry;

  // Atomic write
  workspace.atomicWriteFile(memoryPath, newContent);

  // Git commit
  await workspaceGit.commitFile(
    "MEMORY.md",
    `Add memory: ${fact.slice(0, 50)}...`
  );

  return `Fact saved to MEMORY.md (${Buffer.byteLength(entry)} bytes)`;
}
```

### Pattern 2: Daily Log Auto-Creation
**What:** Create today's daily log file if it doesn't exist, append timestamped entry
**When to use:** Agent writes notes throughout the day (activities, decisions, observations)
**Example:**
```typescript
// Tool: memory_log
// Source: SimpleMem append-only logs + ISO 8601 date formatting

import { WorkspaceManager } from "./workspace.js";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

export async function memoryLog(note: string): Promise<string> {
  const workspace = new WorkspaceManager();
  const memoryDir = workspace.getMemoryDir();

  // Today's log file: YYYY-MM-DD.md
  const today = new Date().toISOString().split("T")[0]; // "2026-02-12"
  const dailyLogPath = resolve(memoryDir, `${today}.md`);

  // Load existing content or create with header
  let content = "";
  if (existsSync(dailyLogPath)) {
    content = readFileSync(dailyLogPath, "utf-8");
  } else {
    content = `# Daily Log: ${today}\n\n`;
  }

  // Append timestamped note
  const timestamp = new Date().toISOString();
  const entry = `## ${timestamp}\n\n${note}\n\n`;
  const newContent = content + entry;

  // Atomic write
  workspace.atomicWriteFile(dailyLogPath, newContent);

  return `Note logged to ${today}.md (${Buffer.byteLength(entry)} bytes)`;
}
```

### Pattern 3: Session-Start Recent Memory Loading
**What:** Load yesterday's and today's daily logs into context at session start
**When to use:** Every agent session initialization (before first user message)
**Example:**
```typescript
// Internal function called by AgentOrchestrator on session start
// Source: Enterprise agent episodic memory pattern

import { WorkspaceManager } from "./workspace.js";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

export function loadRecentMemory(): string {
  const workspace = new WorkspaceManager();
  const memoryDir = workspace.getMemoryDir();

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayFile = today.toISOString().split("T")[0] + ".md";
  const yesterdayFile = yesterday.toISOString().split("T")[0] + ".md";

  let context = "";

  // Load yesterday's log
  const yesterdayPath = resolve(memoryDir, yesterdayFile);
  if (existsSync(yesterdayPath)) {
    const yesterdayContent = readFileSync(yesterdayPath, "utf-8");
    context += `# Yesterday (${yesterdayFile})\n\n${yesterdayContent}\n\n`;
  }

  // Load today's log
  const todayPath = resolve(memoryDir, todayFile);
  if (existsSync(todayPath)) {
    const todayContent = readFileSync(todayPath, "utf-8");
    context += `# Today (${todayFile})\n\n${todayContent}\n\n`;
  }

  return context;
}
```

### Pattern 4: File Watcher for Automatic Indexing
**What:** Watch memory/ directory and MEMORY.md for changes, trigger reindex
**When to use:** Start watcher at agent initialization, runs in background
**Example:**
```typescript
// Source: chokidar docs + Synoindex Watcher pattern

import chokidar from "chokidar";
import { resolve } from "node:path";

export class MemoryWatcher {
  private watcher: chokidar.FSWatcher | null = null;

  constructor(
    private workspaceDir: string,
    private onFileChanged: (filePath: string) => Promise<void>
  ) {}

  start(): void {
    const memoryDir = resolve(this.workspaceDir, "memory");
    const memoryMd = resolve(this.workspaceDir, "MEMORY.md");

    // Watch MEMORY.md and memory/*.md for changes
    this.watcher = chokidar.watch([memoryMd, `${memoryDir}/*.md`], {
      persistent: true,
      ignoreInitial: true, // Don't trigger on existing files
      awaitWriteFinish: {
        stabilityThreshold: 500, // Wait for write to finish
        pollInterval: 100,
      },
    });

    // Debounce: wait 1 second after last change before reindexing
    let timeout: NodeJS.Timeout | null = null;

    this.watcher.on("add", (path) => this.scheduleReindex(path, timeout));
    this.watcher.on("change", (path) => this.scheduleReindex(path, timeout));

    console.log("[memory-watcher] Started watching memory files");
  }

  private scheduleReindex(path: string, timeout: NodeJS.Timeout | null): void {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(async () => {
      console.log(`[memory-watcher] File changed: ${path}, triggering reindex`);
      await this.onFileChanged(path);
    }, 1000);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      console.log("[memory-watcher] Stopped watching memory files");
    }
  }
}
```

### Anti-Patterns to Avoid

- **Writing to memory without timestamps:** Every memory unit MUST have absolute timestamp for recency weighting in Phase 7 search.
- **Editing old daily logs:** Daily logs are append-only. Never modify past entries — breaks temporal ordering.
- **Loading all memory files at session start:** Context overflow. Load yesterday + today only; rest accessed via search (Phase 7).
- **Blocking on git commits:** Memory writes should be fast. Git commits are best-effort (Phase 5 pattern).
- **Manual reindexing:** File watcher automates reindexing. Don't require user to trigger it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File watching | setInterval() polling | chokidar | Handles atomic writes, symlinks, renames; cross-platform event systems (FSEvents, inotify) |
| Date formatting | Manual string manipulation | Date.toISOString() | ISO 8601 standard, timezone-aware, unambiguous |
| Debouncing file events | Custom setTimeout logic | chokidar awaitWriteFinish option | Handles write completion detection, prevents partial reads |
| Memory timestamps | "2 days ago" relative strings | ISO 8601 absolute timestamps | Recency weighting in Phase 7 requires exact datetime comparisons |
| Append operations | Read entire file + append + write | Atomic read-modify-write pattern | Prevents corruption during concurrent writes (though single agent for now) |

**Key insight:** File watching and atomic operations are deceptively complex. Chokidar handles edge cases (large file writes, renames during atomic writes, filesystem event quirks) that custom solutions miss.

## Common Pitfalls

### Pitfall 1: File Watcher Triggering on Atomic Writes
**What goes wrong:** Watcher fires twice per write (once for .tmp, once for rename), causing duplicate reindexing
**Why it happens:** Atomic write pattern creates temp file then renames — some watchers see both events
**How to avoid:**
  1. Use chokidar's `awaitWriteFinish` option to wait for stable file
  2. Debounce with 1 second delay — multiple rapid changes trigger single reindex
  3. Filter events: only watch `*.md`, ignore `*.tmp` and `*.backup`
**Warning signs:**
  - Index rebuilds twice per memory write
  - Logs show "File changed" twice for single user action
  - Performance degradation from excessive reindexing
**Sources:**
  - [chokidar npm](https://www.npmjs.com/package/chokidar)
  - [Synoindex Watcher - Automated media index updates](https://github.com/letorbi/synoindexwatcher)

### Pitfall 2: Context Budget Overflow from Daily Logs
**What goes wrong:** Loading yesterday + today injects 50KB of logs, consuming entire context window
**Why it happens:** No token limit on daily log loading, agent writes verbose notes all day
**How to avoid:**
  1. Truncate loaded daily logs to last 10KB or 2000 tokens per file
  2. Load only the TAIL (most recent entries), not the entire file
  3. Log warning if daily log exceeds threshold: "Today's log is 30KB, consider moving stable facts to MEMORY.md"
  4. Future: Phase 7 search replaces session-start loading for heavy users
**Warning signs:**
  - Agent context truncation warnings
  - First user message in session gets truncated response
  - Daily logs grow to 100KB+ from automation or verbose logging
**Sources:**
  - [Context Window Management: Strategies for Long-Context AI Agents](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/)
  - [A 2026 Memory Stack for Enterprise Agents](https://alok-mishra.com/2026/01/07/a-2026-memory-stack-for-enterprise-agents/)

### Pitfall 3: Memory Contradiction Accumulation
**What goes wrong:** MEMORY.md has "User prefers coffee" (old) and "User quit caffeine" (new), agent gets confused
**Why it happens:** Append-only operations don't replace old facts, no contradiction detection in Phase 6
**How to avoid:**
  1. Phase 6: Accept this limitation — persistence only, no deduplication
  2. Timestamps enable Phase 7 to weight newer facts higher in search results
  3. User can manually edit MEMORY.md to remove outdated facts (git tracks changes)
  4. Future: Phase 7 search implements recency weighting (newer = higher score)
**Warning signs:**
  - Agent gives conflicting answers based on old facts
  - MEMORY.md grows with redundant or contradictory entries
**Sources:**
  - [SimpleMem: Efficient Lifelong Memory for LLM Agents](https://github.com/aiming-lab/SimpleMem)
  - Phase 7 blocker in STATE.md

### Pitfall 4: Git Noise from Daily Logs
**What goes wrong:** Every memory_log call creates a git commit, resulting in 50+ commits per day
**Why it happens:** Daily logs are frequent, git commits are automatic (Phase 5 pattern)
**How to avoid:**
  1. Decision point: Should daily logs be git tracked at all?
  2. Option A: Gitignore `memory/*.md` — daily logs are ephemeral, MEMORY.md is durable
  3. Option B: Track but batch commits (e.g., commit daily logs once per day at midnight)
  4. Recommendation for Phase 6: Track daily logs but accept noise — reevaluate in Phase 7
**Warning signs:**
  - Git log cluttered with "Add note to 2026-02-12.md" commits
  - Git repo grows large from daily log diffs
**Sources:**
  - [OpenClaw Memory Architecture](https://zenvanriel.nl/ai-engineer-blog/openclaw-memory-architecture-guide/)
  - Phase 5 git best-effort pattern

### Pitfall 5: Race Condition in File Watcher Initialization
**What goes wrong:** Agent writes to MEMORY.md before file watcher starts, change not indexed
**Why it happens:** Watcher starts asynchronously, agent might write during startup
**How to avoid:**
  1. Start watcher BEFORE initializing agent orchestrator
  2. Use `ignoreInitial: true` to skip existing files (don't reindex on startup)
  3. Trigger initial index build explicitly after watcher starts
  4. Log watcher lifecycle clearly: "Watcher started" before "Agent ready"
**Warning signs:**
  - First memory write of session not appearing in search results (Phase 7)
  - Watcher logs show "Started watching" AFTER first memory operation
**Sources:**
  - [chokidar npm](https://www.npmjs.com/package/chokidar)
  - [File Watcher and file trigger jobs](https://knowledge.broadcom.com/external/article/209289/file-watcher-and-file-trigger-jobs-watch.html)

## Code Examples

Verified patterns from research and existing codebase:

### Memory Tool Registration (MCP Bridge Pattern)
```typescript
// Source: packages/core/src/sdk-mcp-bridge.ts pattern

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";

// memory_append tool
const memoryAppendTool = tool(
  "memory_append",
  "Append a durable fact to MEMORY.md with timestamp. Use for stable knowledge that should persist across all sessions.",
  {
    fact: z.string().describe("The fact to remember (e.g., 'User prefers dark mode')"),
    category: z.string().optional().describe("Optional category tag (e.g., 'preferences', 'decisions')"),
  },
  async (args) => {
    const result = await memoryAppend(args.fact, args.category);
    return { content: [{ type: "text", text: result }] };
  }
);

// memory_log tool
const memoryLogTool = tool(
  "memory_log",
  "Write a timestamped note to today's daily log. Use for activities, observations, or temporal context.",
  {
    note: z.string().describe("The note to log (e.g., 'Reviewed Linear tickets, 3 blockers identified')"),
  },
  async (args) => {
    const result = await memoryLog(args.note);
    return { content: [{ type: "text", text: result }] };
  }
);
```

### Workspace Manager Extensions
```typescript
// Source: packages/core/src/workspace.ts (Phase 5)
// Add these methods to WorkspaceManager class

export class WorkspaceManager {
  // ... existing Phase 5 methods ...

  private memoryPath: string;
  private memoryDir: string;

  constructor() {
    // ... existing Phase 5 constructor ...
    this.memoryPath = resolve(this.workspaceDir, "MEMORY.md");
    this.memoryDir = resolve(this.workspaceDir, "memory");
  }

  /**
   * Get MEMORY.md file path.
   */
  getMemoryPath(): string {
    return this.memoryPath;
  }

  /**
   * Get memory/ directory path.
   */
  getMemoryDir(): string {
    return this.memoryDir;
  }

  /**
   * Atomic write file (already exists in Phase 5, reuse for memory)
   */
  atomicWriteFile(filePath: string, content: string): void {
    // Existing Phase 5 implementation
  }
}
```

### Truncating Daily Logs for Context Budget
```typescript
// Source: packages/core/src/tools/core-tools.ts truncateHead pattern

function truncateFileContent(content: string, maxBytes: number): string {
  if (Buffer.byteLength(content) <= maxBytes) {
    return content;
  }

  // Take last N bytes (tail of file = most recent entries)
  const lines = content.split("\n").reverse();
  let truncated = "";
  let byteCount = 0;

  for (const line of lines) {
    const lineBytes = Buffer.byteLength(line + "\n");
    if (byteCount + lineBytes > maxBytes) break;
    truncated = line + "\n" + truncated;
    byteCount += lineBytes;
  }

  return `... (truncated: showing last ${maxBytes} bytes)\n\n${truncated}`;
}

export function loadRecentMemory(): string {
  // ... (previous example) ...

  const MAX_DAILY_LOG_BYTES = 10000; // 10KB per file

  if (existsSync(yesterdayPath)) {
    const content = readFileSync(yesterdayPath, "utf-8");
    const truncated = truncateFileContent(content, MAX_DAILY_LOG_BYTES);
    context += `# Yesterday (${yesterdayFile})\n\n${truncated}\n\n`;
  }

  // ... same for today ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Database memory tables | File-based markdown with timestamps | 2025 (OpenClaw, SimpleMem) | Human-readable, git-trackable, portable, no DB overhead |
| Manual memory search | Automatic file watcher + indexing | 2025-2026 | Agent doesn't need to remember to reindex; happens automatically |
| Relative timestamps ("2 days ago") | ISO 8601 absolute timestamps | 2026 (A-MEM, SimpleMem) | Enables recency weighting and temporal reasoning |
| Single memory file | Two-tier: MEMORY.md (curated) + daily logs (episodic) | 2025 (enterprise agents) | Separates stable facts from temporal context |
| Polling for file changes | Event-driven file watching (chokidar) | 2024+ | Lower CPU, instant detection, handles edge cases |

**Deprecated/outdated:**
- **fs.watch() without wrappers:** Raw fs.watch misses atomic writes, doesn't handle cross-platform events. Chokidar is standard.
- **Nested date directories (YYYY/MM/DD.md):** Over-engineered. Flat structure with YYYY-MM-DD.md sorts correctly and globs easily.
- **Memory compaction on write:** Risk of detail loss. Disk is cheap; keep all logs, let search handle retrieval.

## Open Questions

1. **Should daily logs be git tracked?**
   - What we know: MEMORY.md should be tracked (durable facts). Daily logs are frequent (noise in git log).
   - What's unclear: Is git audit trail worth the noise? Or should daily logs be ephemeral?
   - Recommendation: Track for now (enables rollback, audit compliance). If noise becomes problem, gitignore memory/*.md in Phase 7.

2. **Token budget for session-start memory loading**
   - What we know: Yesterday + today could be 20KB+ for heavy users
   - What's unclear: Hard limit or graceful degradation? Truncate head or tail?
   - Recommendation: Truncate to last 10KB (tail) per file with warning. Phase 7 search replaces this for power users.

3. **Memory tool confirmation flow**
   - What we know: Phase 5 preferences use confirmation flow for changes
   - What's unclear: Should `memory_append` require user confirmation, or is agent-initiated append acceptable?
   - Recommendation: No confirmation for memory_append. It's tool output (like gmail_send result). User can review git diff later.

4. **File watcher lifecycle management**
   - What we know: Watcher should start before agent, stop on shutdown
   - What's unclear: What if watcher crashes? Should it auto-restart?
   - Recommendation: Phase 6: best-effort, log error if watcher fails. Phase 7: make watcher critical (reindex depends on it).

5. **Daily log size limits**
   - What we know: Append-only could grow unbounded
   - What's unclear: Cap at N KB? Auto-rotate at midnight? Or rely on user discipline?
   - Recommendation: No hard limit in Phase 6. Log warning at 50KB. Add rotation in v2.1 if needed.

## Sources

### Primary (HIGH confidence)
- [chokidar - npm](https://www.npmjs.com/package/chokidar) - File watching API, debouncing, atomic write handling
- [GitHub - paulmillr/chokidar: Minimal and efficient cross-platform file watching library](https://github.com/paulmillr/chokidar) - Official docs and examples
- [A 2026 Memory Stack for Enterprise Agents](https://alok-mishra.com/2026/01/07/a-2026-memory-stack-for-enterprise-agents/) - Episodic vs semantic memory architecture
- [GitHub - aiming-lab/SimpleMem: SimpleMem: Efficient Lifelong Memory for LLM Agents](https://github.com/aiming-lab/SimpleMem) - Self-contained memory units with timestamps
- [wink-bm25-text-search - npm](https://www.npmjs.com/package/wink-bm25-text-search) - BM25 library for Phase 7 (informational for Phase 6)

### Secondary (MEDIUM confidence)
- [GitHub - agiresearch/A-mem: A-MEM: Agentic Memory for LLM Agents](https://github.com/agiresearch/A-mem) - Zettelkasten-inspired memory organization
- [Synoindex Watcher - Automated media index updates](https://github.com/letorbi/synoindexwatcher) - File watcher triggering reindex pattern
- [Using sqlite-vec in Node.js, Deno, and Bun | sqlite-vec](https://alexgarcia.xyz/sqlite-vec/js.html) - Vector search for Phase 7 (informational)
- [Context Window Management: Strategies for Long-Context AI Agents](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/) - Token budget strategies

### Tertiary (LOW confidence)
- [How to Format Dates as YYYY-MM-DD in Shell Scripts | DevOps Daily](https://devops-daily.com/posts/format-date-yyyy-mm-dd-in-shell-script) - Date formatting (general guidance)
- [File Watcher and file trigger jobs](https://knowledge.broadcom.com/external/article/209289/file-watcher-and-file-trigger-jobs-watch.html) - File watching patterns (not Node.js specific)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - chokidar is industry standard for file watching, proven in production
- Architecture: HIGH - Two-tier memory (curated + daily logs) is well-established pattern (OpenClaw, SimpleMem, A-MEM)
- Pitfalls: HIGH - Context budget overflow and watcher edge cases documented in research
- Integration with Phase 7: MEDIUM - Phase 6 provides hooks, but Phase 7 indexer contract not fully defined yet

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days - stable domain, chokidar v5 recent but mature)

**Key dependencies:**
- Phase 5: WorkspaceManager, WorkspaceGit, atomic write patterns
- Phase 7: Will consume file watcher events and implement search index
- Files to modify: packages/core/src/workspace.ts (extend), packages/core/src/sdk-mcp-bridge.ts (add tools)
- New files: packages/core/src/memory-watcher.ts, packages/core/src/tools/memory-tools.ts
