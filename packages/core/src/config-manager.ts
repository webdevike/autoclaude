/**
 * ConfigManager for mode config modification.
 *
 * Provides atomic writes with rollback on validation failure.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
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
      replyTo: Type.Optional(Type.Object({
        channel: Type.String(),
        chatId: Type.String(),
      })),
    })
  ),
  cwd: Type.Optional(Type.String()),
});

export class ConfigManager {
  private configDir: string;

  constructor(configDir: string) {
    this.configDir = configDir;
  }

  async addCronJob(modeName: string, cronJob: CronJobConfig): Promise<void> {
    const configPath = resolve(this.configDir, `${modeName}.json`);

    if (!existsSync(configPath)) {
      throw new Error(`Mode config '${modeName}' not found at ${configPath}`);
    }

    const backupPath = `${configPath}.backup`;
    const currentContent = readFileSync(configPath, "utf-8");
    writeFileSync(backupPath, currentContent, "utf-8");

    try {
      const config = JSON.parse(currentContent) as ModeConfig;

      if (config.crons.some(c => c.name === cronJob.name)) {
        throw new Error(`Cron job '${cronJob.name}' already exists in mode '${modeName}'`);
      }

      config.crons.push(cronJob);

      if (!Value.Check(ModeConfigSchema, config)) {
        const errors = [...Value.Errors(ModeConfigSchema, config)];
        const errorSummary = errors
          .slice(0, 5)
          .map(err => `${err.path}: ${err.message}`)
          .join("; ");
        throw new Error(`Config validation failed: ${errorSummary}`);
      }

      const tempPath = `${configPath}.tmp`;
      writeFileSync(tempPath, JSON.stringify(config, null, 2), "utf-8");
      renameSync(tempPath, configPath);
      unlinkSync(backupPath);

      console.log(`[config] Added cron job '${cronJob.name}' to mode '${modeName}'`);
    } catch (err) {
      if (existsSync(backupPath)) {
        renameSync(backupPath, configPath);
        console.error(`[config] Rolled back changes to '${modeName}' config`);
      }
      throw err;
    }
  }

  async removeCronJob(modeName: string, jobName: string): Promise<void> {
    const configPath = resolve(this.configDir, `${modeName}.json`);

    if (!existsSync(configPath)) {
      throw new Error(`Mode config '${modeName}' not found at ${configPath}`);
    }

    const backupPath = `${configPath}.backup`;
    const currentContent = readFileSync(configPath, "utf-8");
    writeFileSync(backupPath, currentContent, "utf-8");

    try {
      const config = JSON.parse(currentContent) as ModeConfig;

      const jobIndex = config.crons.findIndex(c => c.name === jobName);
      if (jobIndex === -1) {
        throw new Error(`Cron job '${jobName}' not found in mode '${modeName}'`);
      }

      config.crons.splice(jobIndex, 1);

      if (!Value.Check(ModeConfigSchema, config)) {
        const errors = [...Value.Errors(ModeConfigSchema, config)];
        const errorSummary = errors
          .slice(0, 5)
          .map(err => `${err.path}: ${err.message}`)
          .join("; ");
        throw new Error(`Config validation failed: ${errorSummary}`);
      }

      const tempPath = `${configPath}.tmp`;
      writeFileSync(tempPath, JSON.stringify(config, null, 2), "utf-8");
      renameSync(tempPath, configPath);
      unlinkSync(backupPath);

      console.log(`[config] Removed cron job '${jobName}' from mode '${modeName}'`);
    } catch (err) {
      if (existsSync(backupPath)) {
        renameSync(backupPath, configPath);
        console.error(`[config] Rolled back changes to '${modeName}' config`);
      }
      throw err;
    }
  }

  async updateModeConfigField(
    modeName: string,
    key: string,
    value: unknown
  ): Promise<void> {
    const configPath = resolve(this.configDir, `${modeName}.json`);

    if (!existsSync(configPath)) {
      throw new Error(`Mode config '${modeName}' not found at ${configPath}`);
    }

    const allowedKeys = ["systemPrompt", "tone", "integrations", "statusInterval", "cwd"];
    if (!allowedKeys.includes(key)) {
      throw new Error(
        `Field '${key}' cannot be modified with this tool. Allowed: ${allowedKeys.join(", ")}`
      );
    }

    const backupPath = `${configPath}.backup`;
    const currentContent = readFileSync(configPath, "utf-8");
    writeFileSync(backupPath, currentContent, "utf-8");

    try {
      const config = JSON.parse(currentContent) as ModeConfig;

      (config as any)[key] = value;

      if (!Value.Check(ModeConfigSchema, config)) {
        const errors = [...Value.Errors(ModeConfigSchema, config)];
        const errorSummary = errors
          .slice(0, 5)
          .map(err => `${err.path}: ${err.message}`)
          .join("; ");
        throw new Error(`Config validation failed: ${errorSummary}`);
      }

      const tempPath = `${configPath}.tmp`;
      writeFileSync(tempPath, JSON.stringify(config, null, 2), "utf-8");
      renameSync(tempPath, configPath);
      unlinkSync(backupPath);

      console.log(`[config] Updated ${key} in mode '${modeName}'`);
    } catch (err) {
      if (existsSync(backupPath)) {
        renameSync(backupPath, configPath);
        console.error(`[config] Rolled back changes to '${modeName}' config`);
      }
      throw err;
    }
  }
}
