import type {
  AgentOrchestrator,
  StatusUpdate,
  Channel,
} from "@jarvis/core";
import type { TmuxManager } from "@jarvis/core";

interface ReporterConfig {
  /** Seconds between status updates. 0 = disabled */
  interval: number;
  /** Channels to send status updates to */
  channels: Channel[];
  /** Default recipient for status messages */
  recipient: string;
}

/**
 * Periodically checks on running smart agent sessions
 * and sends you status updates through your active channel.
 */
export class StatusReporter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private orchestrator: AgentOrchestrator;
  private tmux: TmuxManager;
  private config: ReporterConfig;

  constructor(
    orchestrator: AgentOrchestrator,
    tmux: TmuxManager,
    config: ReporterConfig,
  ) {
    this.orchestrator = orchestrator;
    this.tmux = tmux;
    this.config = config;
  }

  /** Start periodic status reporting */
  start(): void {
    if (this.config.interval <= 0) {
      console.log("[status-reporter] Disabled (interval=0).");
      return;
    }

    this.timer = setInterval(
      () => this.report(),
      this.config.interval * 1000,
    );

    // Also listen for orchestrator status events
    this.orchestrator.setStatusHandler((update: StatusUpdate) => {
      if (update.summary.startsWith("Completed:")) {
        this.sendUpdate(
          `Agent [${update.sessionId}] finished:\n${update.summary}`,
        );
      }
    });

    console.log(
      `[status-reporter] Started, reporting every ${this.config.interval}s.`,
    );
  }

  /** Generate and send a status report */
  private async report(): Promise<void> {
    const sessions = this.orchestrator.getSessions();
    const running = sessions.filter((s) => s.status === "running");

    if (running.length === 0) return; // Nothing to report

    const lines: string[] = [`--- Jarvis Status Update ---`];

    for (const session of running) {
      const elapsed = Math.round((Date.now() - session.startedAt) / 1000);
      lines.push(
        `[${session.id}] ${session.tier}/${session.mode} | running ${elapsed}s`,
      );

      if (session.tmuxWindow) {
        const peek = this.tmux.peek(session.tmuxWindow, 10);
        const lastLine = peek.trim().split("\n").pop() ?? "";
        if (lastLine) {
          lines.push(`  └ ${lastLine.slice(0, 200)}`);
        }
      }

      if (session.lastUpdate) {
        lines.push(`  └ last: ${session.lastUpdate}`);
      }
    }

    await this.sendUpdate(lines.join("\n"));
  }

  /** Send a status message through all configured channels */
  private async sendUpdate(text: string): Promise<void> {
    for (const channel of this.config.channels) {
      try {
        await channel.send(this.config.recipient, text);
      } catch (err) {
        console.error(
          `[status-reporter] Failed to send via ${channel.name}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  /** Update reporting interval */
  setInterval(seconds: number): void {
    this.stop();
    this.config.interval = seconds;
    if (seconds > 0) {
      this.start();
    }
  }

  /** Stop reporting */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
