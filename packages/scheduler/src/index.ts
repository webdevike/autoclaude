import cron from "node-cron";
import type { AgentOrchestrator, CronJobConfig, Message, ScheduleType } from "@jarvis/core";
import { randomUUID } from "node:crypto";

interface ScheduledJob {
  config: CronJobConfig;
  /** node-cron task (for type "cron") */
  task?: cron.ScheduledTask;
  /** setTimeout/setInterval handle (for type "at"/"every") */
  timer?: ReturnType<typeof setTimeout>;
}

export class Scheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private orchestrator: AgentOrchestrator;
  private sendReply?: (channel: string, chatId: string, text: string) => Promise<void>;
  private defaultReplyTo?: { channel: string; chatId: string };

  constructor(orchestrator: AgentOrchestrator) {
    this.orchestrator = orchestrator;
  }

  /** Set callback for sending cron responses back to users */
  setSendReply(fn: (channel: string, chatId: string, text: string) => Promise<void>): void {
    this.sendReply = fn;
  }

  /** Set default reply destination for crons that don't specify replyTo */
  setDefaultReplyTo(channel: string, chatId: string): void {
    this.defaultReplyTo = { channel, chatId };
  }

  /** Register and start a job */
  addJob(config: CronJobConfig): void {
    const type: ScheduleType = config.scheduleType || "cron";

    switch (type) {
      case "cron":
        this.addCronJob(config);
        break;
      case "at":
        this.addAtJob(config);
        break;
      case "every":
        this.addEveryJob(config);
        break;
      default:
        console.error(`[scheduler] Unknown schedule type "${type}" for "${config.name}"`);
    }
  }

  /** Standard cron expression job */
  private addCronJob(config: CronJobConfig): void {
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
      `[scheduler] Registered cron: "${config.name}" — ${config.schedule}`,
    );
  }

  /** One-shot job at an ISO 8601 timestamp */
  private addAtJob(config: CronJobConfig): void {
    const targetTime = new Date(config.schedule).getTime();
    if (Number.isNaN(targetTime)) {
      console.error(
        `[scheduler] Invalid ISO 8601 timestamp for "${config.name}": ${config.schedule}`,
      );
      return;
    }

    const delay = targetTime - Date.now();
    if (delay <= 0) {
      console.warn(
        `[scheduler] "at" job "${config.name}" is in the past (${config.schedule}), firing immediately`,
      );
      // Fire immediately then auto-remove
      this.executeCron(config).then(() => this.removeJob(config.name));
      return;
    }

    const timer = setTimeout(async () => {
      console.log(`[scheduler] Firing one-shot: ${config.name}`);
      await this.executeCron(config);
      // Auto-remove after firing
      this.jobs.delete(config.name);
      console.log(`[scheduler] One-shot "${config.name}" completed and removed`);
    }, delay);

    this.jobs.set(config.name, { config, timer });
    console.log(
      `[scheduler] Registered one-shot: "${config.name}" — fires at ${config.schedule} (in ${Math.round(delay / 1000)}s)`,
    );
  }

  /** Recurring interval job (schedule = milliseconds) */
  private addEveryJob(config: CronJobConfig): void {
    const intervalMs = Number(config.schedule);
    if (Number.isNaN(intervalMs) || intervalMs < 1000) {
      console.error(
        `[scheduler] Invalid interval for "${config.name}": ${config.schedule} (must be number >= 1000ms)`,
      );
      return;
    }

    const timer = setInterval(async () => {
      console.log(`[scheduler] Firing interval: ${config.name}`);
      await this.executeCron(config);
    }, intervalMs);

    this.jobs.set(config.name, { config, timer });
    console.log(
      `[scheduler] Registered interval: "${config.name}" — every ${intervalMs}ms`,
    );
  }

  /** Load jobs from mode configs */
  loadFromConfigs(configs: CronJobConfig[]): void {
    for (const config of configs) {
      this.addJob(config);
    }
  }

  /** Execute a job by sending its prompt to the orchestrator */
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

      // Send response to user via replyTo or default
      const dest = config.replyTo ?? this.defaultReplyTo;
      if (dest && this.sendReply) {
        await this.sendReply(dest.channel, dest.chatId, response.text);
        console.log(`[scheduler] ${config.name} reply sent to ${dest.channel}/${dest.chatId}`);
      }
    } catch (err) {
      console.error(
        `[scheduler] ${config.name} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  /** List all registered jobs */
  listJobs(): Array<{ name: string; schedule: string; scheduleType: ScheduleType; mode: string; tier: string }> {
    return Array.from(this.jobs.values()).map((j) => ({
      name: j.config.name,
      schedule: j.config.schedule,
      scheduleType: (j.config.scheduleType || "cron") as ScheduleType,
      mode: j.config.mode,
      tier: j.config.tier,
    }));
  }

  /** Remove a job by name */
  removeJob(name: string): boolean {
    const job = this.jobs.get(name);
    if (job) {
      if (job.task) job.task.stop();
      if (job.timer) clearTimeout(job.timer);
      this.jobs.delete(name);
      return true;
    }
    return false;
  }

  /** Stop all jobs */
  shutdown(): void {
    for (const [_name, job] of this.jobs) {
      if (job.task) job.task.stop();
      if (job.timer) clearTimeout(job.timer);
    }
    this.jobs.clear();
    console.log("[scheduler] All jobs stopped.");
  }
}
