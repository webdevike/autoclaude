/**
 * CronScheduler for in-process cron job management.
 *
 * Manages scheduled tasks using node-cron, with validation via cron-parser.
 * Loads jobs from mode configs on startup and provides methods for runtime management.
 */

import cron from "node-cron";
import { CronExpressionParser } from "cron-parser";
import type { CronJobConfig, ModeConfig } from "./types.js";

/**
 * Scheduled task wrapper with node-cron instance.
 */
interface ScheduledTask {
  config: CronJobConfig;
  task: cron.ScheduledTask;
}

/**
 * CronScheduler class for in-process scheduling.
 *
 * Features:
 * - Validates cron expressions with cron.validate()
 * - Stores tasks in Map for O(1) lookup
 * - Calculates next run times with cron-parser
 * - Loads jobs from mode configs on startup
 */
export class CronScheduler {
  private tasks: Map<string, ScheduledTask> = new Map();

  /**
   * Schedule a new cron job.
   *
   * @param config The cron job configuration
   * @throws Error if schedule is invalid or job already exists
   */
  scheduleJob(config: CronJobConfig): void {
    // Validate cron expression
    if (!cron.validate(config.schedule)) {
      throw new Error(`Invalid cron expression: ${config.schedule}`);
    }

    // Check for duplicates
    if (this.tasks.has(config.name)) {
      throw new Error(`Cron job '${config.name}' already exists`);
    }

    // Create task
    const task = cron.schedule(
      config.schedule,
      () => {
        this.executeJob(config).catch(err => {
          console.error(`[cron] Error executing job '${config.name}':`, err);
        });
      },
      {
        scheduled: true,
        timezone: "America/New_York", // Default timezone, could be made configurable
      }
    );

    this.tasks.set(config.name, { config, task });
    console.log(`[cron] Scheduled job '${config.name}' with schedule: ${config.schedule}`);
  }

  /**
   * Unschedule a cron job.
   *
   * @param name The job name
   * @returns True if job was removed, false if not found
   */
  unscheduleJob(name: string): boolean {
    const scheduled = this.tasks.get(name);
    if (!scheduled) {
      return false;
    }

    scheduled.task.stop();
    this.tasks.delete(name);
    console.log(`[cron] Unscheduled job '${name}'`);
    return true;
  }

  /**
   * Load cron jobs from mode configs.
   *
   * Called on AgentOrchestrator startup to schedule all configured jobs.
   *
   * @param modes Map of mode configs
   */
  loadFromModeConfigs(modes: Map<string, ModeConfig>): void {
    let totalJobs = 0;

    for (const [modeName, modeConfig] of modes.entries()) {
      if (!modeConfig.crons || modeConfig.crons.length === 0) {
        continue;
      }

      for (const cronConfig of modeConfig.crons) {
        try {
          // Ensure mode is set correctly
          const config = { ...cronConfig, mode: modeName };
          this.scheduleJob(config);
          totalJobs++;
        } catch (err) {
          console.error(
            `[cron] Failed to schedule job '${cronConfig.name}' for mode '${modeName}':`,
            err
          );
        }
      }
    }

    console.log(`[cron] Loaded ${totalJobs} cron jobs from mode configs`);
  }

  /**
   * List all scheduled jobs.
   *
   * @returns Array of job info with name, schedule, nextRun, enabled status
   */
  listJobs(): Array<{
    name: string;
    schedule: string;
    nextRun: string;
    enabled: boolean;
    mode: string;
    tier: string;
  }> {
    const jobs: Array<{
      name: string;
      schedule: string;
      nextRun: string;
      enabled: boolean;
      mode: string;
      tier: string;
    }> = [];

    for (const [name, scheduled] of this.tasks.entries()) {
      try {
        // Parse to get next run time
        const interval = CronExpressionParser.parse(scheduled.config.schedule, {
          tz: "America/New_York",
        });
        const nextDate = interval.next();
        const nextRun = (nextDate?.toISOString() ?? "No future runs") as string;

        jobs.push({
          name,
          schedule: scheduled.config.schedule,
          nextRun,
          enabled: true, // If in map, it's enabled
          mode: scheduled.config.mode,
          tier: scheduled.config.tier,
        });
      } catch (err) {
        console.error(`[cron] Error calculating next run for job '${name}':`, err);
        jobs.push({
          name,
          schedule: scheduled.config.schedule,
          nextRun: "Error calculating next run",
          enabled: true,
          mode: scheduled.config.mode,
          tier: scheduled.config.tier,
        });
      }
    }

    return jobs;
  }

  /**
   * Get a specific job config.
   *
   * @param name The job name
   * @returns The job config if exists, undefined otherwise
   */
  getJob(name: string): CronJobConfig | undefined {
    return this.tasks.get(name)?.config;
  }

  /**
   * Execute a cron job.
   *
   * Stub implementation - will be integrated with gateway in later phase.
   * For now, just logs execution.
   *
   * @param config The cron job configuration
   */
  private async executeJob(config: CronJobConfig): Promise<void> {
    console.log(`[cron] Executing job: ${config.name}`);
    console.log(`[cron]   Mode: ${config.mode}`);
    console.log(`[cron]   Tier: ${config.tier}`);
    console.log(`[cron]   Prompt: ${config.prompt}`);

    // TODO: Integrate with AgentOrchestrator.handleMessage() or runSmartAgent()
    // Will need orchestrator reference or executor callback pattern
  }
}

/**
 * Singleton CronScheduler instance.
 */
export const scheduler = new CronScheduler();
