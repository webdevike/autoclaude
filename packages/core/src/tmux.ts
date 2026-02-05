import { execSync, spawn, type ChildProcess } from "node:child_process";

const JARVIS_SESSION = "jarvis-agents";

export class TmuxManager {
  private processes: Map<string, ChildProcess> = new Map();

  /** Ensure the jarvis tmux session exists */
  ensureSession(): void {
    try {
      execSync(`tmux has-session -t ${JARVIS_SESSION} 2>/dev/null`);
    } catch {
      execSync(`tmux new-session -d -s ${JARVIS_SESSION} -n main`);
    }
  }

  /** Spawn a smart agent in a named tmux window. Returns the window name. */
  spawnAgent(
    windowName: string,
    command: string,
    env?: Record<string, string>,
  ): string {
    this.ensureSession();

    // Create a new window in the jarvis session
    execSync(
      `tmux new-window -t ${JARVIS_SESSION} -n ${windowName} -d`,
    );

    // Send the command to the window
    const escapedCmd = command.replace(/'/g, "'\\''");
    execSync(
      `tmux send-keys -t ${JARVIS_SESSION}:${windowName} '${escapedCmd}' Enter`,
    );

    return windowName;
  }

  /** Spawn a process inside a tmux window and track it */
  spawnProcess(
    windowName: string,
    cmd: string,
    args: string[],
    env?: Record<string, string>,
  ): ChildProcess {
    this.ensureSession();

    const proc = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.processes.set(windowName, proc);

    // Also create the tmux window piping output there for visibility
    try {
      execSync(
        `tmux new-window -t ${JARVIS_SESSION} -n ${windowName} -d`,
      );
    } catch {
      // Window might already exist
    }

    // Pipe stdout/stderr to the tmux pane
    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString().replace(/'/g, "'\\''");
      try {
        execSync(
          `tmux send-keys -t ${JARVIS_SESSION}:${windowName} '${text}' Enter`,
        );
      } catch {
        // tmux window may have been closed
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().replace(/'/g, "'\\''");
      try {
        execSync(
          `tmux send-keys -t ${JARVIS_SESSION}:${windowName} '${text}' Enter`,
        );
      } catch {
        // tmux window may have been closed
      }
    });

    return proc;
  }

  /** Capture current output from a tmux window */
  peek(windowName: string, lines: number = 50): string {
    try {
      return execSync(
        `tmux capture-pane -t ${JARVIS_SESSION}:${windowName} -p -S -${lines}`,
      ).toString();
    } catch {
      return `[window ${windowName} not found]`;
    }
  }

  /** List all active agent windows */
  listWindows(): string[] {
    try {
      const output = execSync(
        `tmux list-windows -t ${JARVIS_SESSION} -F "#{window_name}"`,
      ).toString();
      return output.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  /** Kill a specific agent window */
  killWindow(windowName: string): void {
    try {
      execSync(
        `tmux kill-window -t ${JARVIS_SESSION}:${windowName}`,
      );
    } catch {
      // Already gone
    }
    const proc = this.processes.get(windowName);
    if (proc) {
      proc.kill();
      this.processes.delete(windowName);
    }
  }

  /** Kill all agent windows and the session */
  shutdown(): void {
    for (const [name, proc] of this.processes) {
      proc.kill();
    }
    this.processes.clear();
    try {
      execSync(`tmux kill-session -t ${JARVIS_SESSION}`);
    } catch {
      // Already gone
    }
  }
}
