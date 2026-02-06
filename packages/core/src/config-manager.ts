/**
 * ConfigManager for mode config modification with git audit trail.
 *
 * Provides atomic writes with rollback on validation failure and best-effort
 * git commits for audit trail.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { ModeConfig, CronJobConfig } from "./types.js";

/**
 * TypeBox schema for ModeConfig validation.
 *
 * Ensures config structure is valid before persisting changes.
 */
const ModeConfigSchema = Type.Object({
  mode: Type.String(),
  systemPrompt: Type.String(),
  tone: Type.Optional(Type.String()),
  triage: Type.Object({
    model: Type.String(),
    maxTokens: Type.Number(),
  }),
  smart: Type.Object({
    model: Type.String(),
    maxTokens: Type.Number(),
  }),
  channels: Type.Array(Type.String()),
  integrations: Type.Array(Type.String()),
  statusInterval: Type.Number(),
  crons: Type.Array(
    Type.Object({
      name: Type.String(),
      schedule: Type.String(),
      prompt: Type.String(),
      tier: Type.Union([Type.Literal("triage"), Type.Literal("smart")]),
      mode: Type.String(),
    })
  ),
  cwd: Type.Optional(Type.String()),
});

/**
 * ConfigManager for mode config modification with git audit trail.
 *
 * Features:
 * - Atomic writes via temp file + fs.renameSync
 * - TypeBox validation before persisting
 * - Automatic rollback on validation failure
 * - Best-effort git commits (logs but doesn't throw on git failures)
 * - Config history via git log
 */
export class ConfigManager {
  private configDir: string;
  private git: SimpleGit;

  constructor(configDir: string) {
    this.configDir = configDir;
    this.git = simpleGit(configDir);
  }

  /**
   * Add a cron job to a mode config.
   *
   * @param modeName The mode name (e.g., "work", "personal")
   * @param cronJob The cron job configuration
   * @throws Error if config invalid or job already exists
   */
  async addCronJob(modeName: string, cronJob: CronJobConfig): Promise<void> {
    const configPath = resolve(this.configDir, `${modeName}.json`);

    // Check config exists
    if (!existsSync(configPath)) {
      throw new Error(`Mode config '${modeName}' not found at ${configPath}`);
    }

    // Backup current config
    const backupPath = `${configPath}.backup`;
    const currentContent = readFileSync(configPath, "utf-8");
    writeFileSync(backupPath, currentContent, "utf-8");

    try {
      // Load and parse
      const config = JSON.parse(currentContent) as ModeConfig;

      // Check for duplicate
      if (config.crons.some(c => c.name === cronJob.name)) {
        throw new Error(`Cron job '${cronJob.name}' already exists in mode '${modeName}'`);
      }

      // Add job
      config.crons.push(cronJob);

      // Validate with TypeBox
      if (!Value.Check(ModeConfigSchema, config)) {
        const errors = [...Value.Errors(ModeConfigSchema, config)];
        const errorSummary = errors
          .slice(0, 5)
          .map(err => `${err.path}: ${err.message}`)
          .join("; ");
        throw new Error(`Config validation failed: ${errorSummary}`);
      }

      // Atomic write
      const tempPath = `${configPath}.tmp`;
      writeFileSync(tempPath, JSON.stringify(config, null, 2), "utf-8");
      renameSync(tempPath, configPath);

      // Commit change
      await this.commitConfigChange(
        configPath,
        `add cron job '${cronJob.name}' to ${modeName} mode`,
        "cron"
      );

      // Cleanup backup
      unlinkSync(backupPath);

      console.log(`[config] Added cron job '${cronJob.name}' to mode '${modeName}'`);
    } catch (err) {
      // Rollback on failure
      if (existsSync(backupPath)) {
        renameSync(backupPath, configPath);
        console.error(`[config] Rolled back changes to '${modeName}' config`);
      }
      throw err;
    }
  }

  /**
   * Remove a cron job from a mode config.
   *
   * @param modeName The mode name
   * @param jobName The job name to remove
   * @throws Error if config invalid or job not found
   */
  async removeCronJob(modeName: string, jobName: string): Promise<void> {
    const configPath = resolve(this.configDir, `${modeName}.json`);

    // Check config exists
    if (!existsSync(configPath)) {
      throw new Error(`Mode config '${modeName}' not found at ${configPath}`);
    }

    // Backup current config
    const backupPath = `${configPath}.backup`;
    const currentContent = readFileSync(configPath, "utf-8");
    writeFileSync(backupPath, currentContent, "utf-8");

    try {
      // Load and parse
      const config = JSON.parse(currentContent) as ModeConfig;

      // Find job
      const jobIndex = config.crons.findIndex(c => c.name === jobName);
      if (jobIndex === -1) {
        throw new Error(`Cron job '${jobName}' not found in mode '${modeName}'`);
      }

      // Remove job
      config.crons.splice(jobIndex, 1);

      // Validate with TypeBox
      if (!Value.Check(ModeConfigSchema, config)) {
        const errors = [...Value.Errors(ModeConfigSchema, config)];
        const errorSummary = errors
          .slice(0, 5)
          .map(err => `${err.path}: ${err.message}`)
          .join("; ");
        throw new Error(`Config validation failed: ${errorSummary}`);
      }

      // Atomic write
      const tempPath = `${configPath}.tmp`;
      writeFileSync(tempPath, JSON.stringify(config, null, 2), "utf-8");
      renameSync(tempPath, configPath);

      // Commit change
      await this.commitConfigChange(
        configPath,
        `remove cron job '${jobName}' from ${modeName} mode`,
        "cron"
      );

      // Cleanup backup
      unlinkSync(backupPath);

      console.log(`[config] Removed cron job '${jobName}' from mode '${modeName}'`);
    } catch (err) {
      // Rollback on failure
      if (existsSync(backupPath)) {
        renameSync(backupPath, configPath);
        console.error(`[config] Rolled back changes to '${modeName}' config`);
      }
      throw err;
    }
  }

  /**
   * Update a mode config field.
   *
   * Validates key against whitelist and entire config before persisting.
   *
   * @param modeName The mode name
   * @param key The config field key
   * @param value The new value
   * @throws Error if key not allowed or validation fails
   */
  async updateModeConfigField(
    modeName: string,
    key: string,
    value: unknown
  ): Promise<void> {
    const configPath = resolve(this.configDir, `${modeName}.json`);

    // Check config exists
    if (!existsSync(configPath)) {
      throw new Error(`Mode config '${modeName}' not found at ${configPath}`);
    }

    // Whitelist allowed keys (not triage, smart, mode, channels, crons - these need special handling)
    const allowedKeys = ["systemPrompt", "tone", "integrations", "statusInterval", "cwd"];
    if (!allowedKeys.includes(key)) {
      throw new Error(
        `Field '${key}' cannot be modified with this tool. Allowed: ${allowedKeys.join(", ")}`
      );
    }

    // Backup current config
    const backupPath = `${configPath}.backup`;
    const currentContent = readFileSync(configPath, "utf-8");
    writeFileSync(backupPath, currentContent, "utf-8");

    try {
      // Load and parse
      const config = JSON.parse(currentContent) as ModeConfig;

      // Apply update
      (config as any)[key] = value;

      // Validate entire config
      if (!Value.Check(ModeConfigSchema, config)) {
        const errors = [...Value.Errors(ModeConfigSchema, config)];
        const errorSummary = errors
          .slice(0, 5)
          .map(err => `${err.path}: ${err.message}`)
          .join("; ");
        throw new Error(`Config validation failed: ${errorSummary}`);
      }

      // Atomic write
      const tempPath = `${configPath}.tmp`;
      writeFileSync(tempPath, JSON.stringify(config, null, 2), "utf-8");
      renameSync(tempPath, configPath);

      // Commit change
      await this.commitConfigChange(
        configPath,
        `update ${key} in ${modeName} mode`,
        "mode"
      );

      // Cleanup backup
      unlinkSync(backupPath);

      console.log(`[config] Updated ${key} in mode '${modeName}'`);
    } catch (err) {
      // Rollback on failure
      if (existsSync(backupPath)) {
        renameSync(backupPath, configPath);
        console.error(`[config] Rolled back changes to '${modeName}' config`);
      }
      throw err;
    }
  }

  /**
   * Commit config changes to git for audit trail.
   *
   * Best-effort: logs but doesn't throw on git failures.
   *
   * @param filePath The config file path
   * @param description Human-readable description of change
   * @param type The change type (mode or cron)
   */
  private async commitConfigChange(
    filePath: string,
    description: string,
    type: "mode" | "cron"
  ): Promise<void> {
    try {
      await this.git.add(filePath);
      await this.git.commit(
        `config(${type}): ${description}\n\nCo-Authored-By: Jarvis Agent <jarvis@jarvis.local>`
      );
      console.log(`[config] Git commit created: ${description}`);
    } catch (err) {
      // Best-effort: log but don't throw
      console.warn(`[config] Git commit failed (non-blocking):`, err);
    }
  }

  /**
   * Get config change history from git log.
   *
   * @param modeName The mode name
   * @param limit Maximum number of commits to return (default 10)
   * @returns Array of commit info (hash, date, message)
   */
  async getConfigHistory(
    modeName: string,
    limit = 10
  ): Promise<Array<{ hash: string; date: string; message: string }>> {
    try {
      const configPath = `${modeName}.json`;
      const log = await this.git.log({
        file: configPath,
        maxCount: limit,
      });

      return log.all.map((commit: any) => ({
        hash: commit.hash.substring(0, 7),
        date: commit.date,
        message: commit.message,
      }));
    } catch (err) {
      console.error(`[config] Failed to get config history for '${modeName}':`, err);
      return [];
    }
  }
}
