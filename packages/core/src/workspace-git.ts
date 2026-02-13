/**
 * Git-based audit trail for workspace changes.
 *
 * Provides best-effort git operations for SOUL.md and MEMORY.md versioning.
 * All methods are non-throwing - git failures are logged but never block agent operations.
 */

import { existsSync, writeFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";

/**
 * Default .gitignore content for workspace repository.
 * Excludes session data and user-specific preferences from version control.
 */
const DEFAULT_GITIGNORE = `sessions/
preferences/
*.tmp
*.backup
`;

/**
 * Manages git repository for workspace audit trail.
 *
 * Features:
 * - Automatic repo initialization on first use
 * - Timestamped commits for file changes
 * - Diff and log retrieval for change history
 * - Best-effort operations (never throws errors)
 *
 * All methods catch errors and log warnings - git failures must not block agent operations.
 */
export class WorkspaceGit {
  private git: SimpleGit;

  constructor(private workspaceDir: string) {
    this.git = simpleGit(workspaceDir);
  }

  /**
   * Initialize git repository in workspace if not already initialized.
   *
   * Creates:
   * - .git/ directory
   * - .gitignore (excludes sessions/, preferences/, *.tmp, *.backup)
   * - Initial commit with SOUL.md and MEMORY.md
   *
   * Safe to call multiple times - idempotent.
   * Never throws - logs warnings on failure.
   */
  async initRepo(): Promise<void> {
    try {
      const isRepo = await this.git.checkIsRepo();

      if (!isRepo) {
        // Initialize repository
        await this.git.init();

        // Write .gitignore
        const gitignorePath = resolve(this.workspaceDir, ".gitignore");
        const tempPath = `${gitignorePath}.tmp`;
        writeFileSync(tempPath, DEFAULT_GITIGNORE, "utf-8");
        renameSync(tempPath, gitignorePath);

        // Stage .gitignore
        await this.git.add(".gitignore");

        // Stage SOUL.md if exists
        const soulPath = resolve(this.workspaceDir, "SOUL.md");
        if (existsSync(soulPath)) {
          await this.git.add("SOUL.md");
        }

        // Stage MEMORY.md if exists
        const memoryPath = resolve(this.workspaceDir, "MEMORY.md");
        if (existsSync(memoryPath)) {
          await this.git.add("MEMORY.md");
        }

        // Create initial commit
        await this.git.commit("Initial workspace setup");

        console.log(`[workspace-git] Initialized git repo at ${this.workspaceDir}`);
      } else {
        console.log(`[workspace-git] Git repo exists at ${this.workspaceDir}`);
      }
    } catch (err) {
      console.warn(`[workspace-git] Git init failed (non-fatal): ${err}`);
    }
  }

  /**
   * Commit a file with optional custom message.
   *
   * If no message provided, uses: "Update {file} - {timestamp}"
   *
   * Never throws - logs warnings on failure.
   *
   * @param file File path relative to workspace directory
   * @param message Optional commit message
   */
  async commitFile(file: string, message?: string): Promise<void> {
    try {
      await this.git.add(file);

      const timestamp = new Date().toISOString();
      const commitMsg = message || `Update ${file} - ${timestamp}`;

      await this.git.commit(commitMsg);

      console.log(`[workspace-git] Committed ${file}: ${commitMsg}`);
    } catch (err) {
      console.warn(`[workspace-git] Commit failed (non-fatal): ${err}`);
    }
  }

  /**
   * Get diff for a file.
   *
   * Returns empty string on error.
   *
   * @param file File path relative to workspace directory
   * @returns Diff output or empty string on error
   */
  async getDiff(file: string): Promise<string> {
    try {
      return await this.git.diff([file]);
    } catch (err) {
      console.warn(`[workspace-git] getDiff failed: ${err}`);
      return "";
    }
  }

  /**
   * Get commit log for a file.
   *
   * Returns empty array on error.
   *
   * @param file File path relative to workspace directory
   * @param maxCount Maximum number of commits to retrieve (default: 10)
   * @returns Array of commit entries or empty array on error
   */
  async getLog(
    file: string,
    maxCount = 10
  ): Promise<Array<{ hash: string; date: string; message: string }>> {
    try {
      const log = await this.git.log({ file, maxCount });
      return log.all.map(e => ({
        hash: e.hash,
        date: e.date,
        message: e.message,
      }));
    } catch (err) {
      console.warn(`[workspace-git] getLog failed: ${err}`);
      return [];
    }
  }
}
