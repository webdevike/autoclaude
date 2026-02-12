/**
 * Workspace management for agent identity and memory persistence.
 *
 * Manages ~/.jarvis/workspace/ directory structure:
 * - SOUL.md: Agent identity and communication style
 * - MEMORY.md: Curated long-term memory
 * - memory/: Daily memory logs
 * - sessions/: Session transcripts (not tracked by git)
 * - preferences/: User-specific preferences (not tracked by git)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

/**
 * Default SOUL.md template written on first workspace initialization.
 */
const DEFAULT_SOUL_TEMPLATE = `# Jarvis Soul

## Who I Am
A personal AI assistant for Ike. Direct, casual, helpful.

## Communication Style
- Be concise unless asked for detail
- Use plain language, avoid corporate speak
- Show work when problem-solving
- Match the user's energy and tone

## Boundaries
- Never write to SOUL.md without explicit user confirmation
- Always ask before destructive operations
- Respect privacy: don't store sensitive data in memory logs

## Continuity Notes
<!-- Add notes here that should persist across sessions -->
`;

/**
 * Default MEMORY.md placeholder written on first workspace initialization.
 */
const DEFAULT_MEMORY_PLACEHOLDER = `# Memory

Curated long-term memory. Updated by agent with user confirmation.
`;

/**
 * Character limits for SOUL.md to manage context budget.
 * - Warning at 6000 chars (~1500 tokens)
 * - Hard error at 12000 chars (~3000 tokens)
 */
const SOUL_CHAR_WARNING = 6000;
const SOUL_CHAR_LIMIT = 12000;

/**
 * Manages workspace directory structure and SOUL.md loading.
 *
 * Features:
 * - Lazy initialization of ~/.jarvis/workspace/ on first access
 * - Atomic file writes via temp file + fs.renameSync
 * - Character limit enforcement for SOUL.md (warning at 6k, error at 12k)
 * - Graceful fallback to defaults on read errors
 */
export class WorkspaceManager {
  private workspaceDir: string;
  private soulPath: string;
  private memoryPath: string;
  private memorySubdir: string;
  private sessionsSubdir: string;
  private preferencesSubdir: string;

  constructor() {
    this.workspaceDir = resolve(homedir(), ".jarvis", "workspace");
    this.soulPath = resolve(this.workspaceDir, "SOUL.md");
    this.memoryPath = resolve(this.workspaceDir, "MEMORY.md");
    this.memorySubdir = resolve(this.workspaceDir, "memory");
    this.sessionsSubdir = resolve(this.workspaceDir, "sessions");
    this.preferencesSubdir = resolve(this.workspaceDir, "preferences");
  }

  /**
   * Ensure workspace directory and default files exist.
   *
   * Creates:
   * - ~/.jarvis/workspace/ directory
   * - memory/, sessions/, preferences/ subdirectories
   * - SOUL.md (if missing)
   * - MEMORY.md (if missing)
   *
   * Safe to call multiple times - idempotent.
   */
  ensureWorkspace(): void {
    const isFirstInit = !existsSync(this.workspaceDir);

    // Create workspace directory and subdirectories
    mkdirSync(this.workspaceDir, { recursive: true });
    mkdirSync(this.memorySubdir, { recursive: true });
    mkdirSync(this.sessionsSubdir, { recursive: true });
    mkdirSync(this.preferencesSubdir, { recursive: true });

    // Initialize SOUL.md if missing
    if (!existsSync(this.soulPath)) {
      this.atomicWriteFile(this.soulPath, DEFAULT_SOUL_TEMPLATE);
    }

    // Initialize MEMORY.md if missing
    if (!existsSync(this.memoryPath)) {
      this.atomicWriteFile(this.memoryPath, DEFAULT_MEMORY_PLACEHOLDER);
    }

    if (isFirstInit) {
      console.log(`[workspace] Initialized workspace at ${this.workspaceDir}`);
    } else {
      console.log(`[workspace] Workspace exists at ${this.workspaceDir}`);
    }
  }

  /**
   * Load SOUL.md content from workspace.
   *
   * Features:
   * - Ensures workspace exists before reading
   * - Character limit enforcement (warning at 6k, error at 12k)
   * - Graceful fallback to default template on read errors
   *
   * @returns SOUL.md content string
   * @throws Error if SOUL.md exceeds 12000 characters
   */
  loadSoul(): string {
    // Ensure workspace exists
    this.ensureWorkspace();

    try {
      const content = readFileSync(this.soulPath, "utf-8");

      // Enforce character limits
      if (content.length > SOUL_CHAR_LIMIT) {
        throw new Error(
          `SOUL.md too large (${content.length} chars, max ${SOUL_CHAR_LIMIT}). ` +
          `Please trim to stay within context budget.`
        );
      }

      if (content.length > SOUL_CHAR_WARNING) {
        console.warn(
          `[workspace] Warning: SOUL.md is ${content.length} chars ` +
          `(recommend < ${SOUL_CHAR_WARNING} for context budget)`
        );
      }

      return content;
    } catch (err) {
      // If file doesn't exist after ensureWorkspace(), something went wrong
      // If character limit exceeded, re-throw
      if (err instanceof Error && err.message.includes("too large")) {
        throw err;
      }

      // For other read errors, log warning and return default
      console.warn(`[workspace] Failed to load SOUL.md: ${err}. Using default template.`);
      return DEFAULT_SOUL_TEMPLATE;
    }
  }

  /**
   * Build system prompt with SOUL.md prepended.
   *
   * Format:
   * ```
   * [SOUL.md content]
   *
   * ---
   *
   * [base system prompt]
   * ```
   *
   * @param basePrompt The base system prompt to append
   * @returns Combined prompt with SOUL.md prepended
   */
  buildSystemPrompt(basePrompt: string): string {
    const soul = this.loadSoul();
    return `${soul}\n\n---\n\n${basePrompt}`;
  }

  /**
   * Get workspace directory path.
   *
   * @returns Absolute path to workspace directory
   */
  getWorkspaceDir(): string {
    return this.workspaceDir;
  }

  /**
   * Get SOUL.md file path.
   *
   * @returns Absolute path to SOUL.md
   */
  getSoulPath(): string {
    return this.soulPath;
  }

  /**
   * Atomic file write using temp file + fs.renameSync.
   *
   * Pattern from preferences.ts - POSIX atomic operation.
   *
   * @param filePath Target file path
   * @param content Content to write
   * @private
   */
  private atomicWriteFile(filePath: string, content: string): void {
    // Ensure parent directory exists
    const parentDir = resolve(filePath, "..");
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    // Write to temp file, then rename atomically
    const tempPath = `${filePath}.tmp`;
    writeFileSync(tempPath, content, "utf-8");
    renameSync(tempPath, filePath);
  }
}
