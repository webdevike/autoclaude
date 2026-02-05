import cron from "node-cron";
import type { AgentOrchestrator, CronJobConfig, Message } from "@jarvis/core";
import { randomUUID } from "node:crypto";

interface ScheduledJob {
  config: CronJobConfig;
  task: cron.ScheduledTask;
}

export class Scheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private orchestrator: AgentOrchestrator;

  constructor(orchestrator: AgentOrchestrator) {
    this.orchestrator = orchestrator;
  }

  /** Register and start a cron job */
  addJob(config: CronJobConfig): void {
    if (!cron.validate(config.schedule)) {
      console.error(
        `[scheduler] Invalid cron expression for "${config.name}": ${config.schedule}`,
      );
      return;
    }

    const task = cron.schedule(config.schedule, async () => {
      console.log(`[scheduler] Firing cron: ${config.name}`);
      await this.executeCron(config);
    });

    this.jobs.set(config.name, { config, task });
    console.log(
      `[scheduler] Registered: "${config.name}" — ${config.schedule}`,
    );
  }

  /** Load jobs from mode configs */
  loadFromConfigs(configs: CronJobConfig[]): void {
    for (const config of configs) {
      this.addJob(config);
    }
  }

  /** Execute a cron job by sending its prompt to the orchestrator */
  private async executeCron(config: CronJobConfig): Promise<void> {
    const msg: Message = {
      id: randomUUID(),
      channel: "cron",
      sender: `cron:${config.name}`,
      text: config.prompt,
      timestamp: Date.now(),
      mode: config.mode,
    };

    try {
      const response = await this.orchestrator.handleMessage(msg);
      console.log(
        `[scheduler] ${config.name} completed: ${response.text.slice(0, 200)}`,
      );
    } catch (err) {
      console.error(
        `[scheduler] ${config.name} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  /** List all registered jobs */
  listJobs(): Array<{ name: string; schedule: string; mode: string; tier: string }> {
    return Array.from(this.jobs.values()).map((j) => ({
      name: j.config.name,
      schedule: j.config.schedule,
      mode: j.config.mode,
      tier: j.config.tier,
    }));
  }

  /** Remove a job by name */
  removeJob(name: string): boolean {
    const job = this.jobs.get(name);
    if (job) {
      job.task.stop();
      this.jobs.delete(name);
      return true;
    }
    return false;
  }

  /** Stop all cron jobs */
  shutdown(): void {
    for (const [name, job] of this.jobs) {
      job.task.stop();
    }
    this.jobs.clear();
    console.log("[scheduler] All jobs stopped.");
  }
}
