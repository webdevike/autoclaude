/**
 * Autonomous multi-phase task runner.
 *
 * Lifecycle: plan → approve → execute phases → complete
 * Each phase runs as a fresh Claude Code SDK session with PROGRESS.md carrying context.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { runClaudeCode } from "./claude-code-delegate.js";
import type {
  AutonomousTask,
  TaskPhase,
  TaskStatus,
  InlineKeyboardMarkup,
  CallbackQuery,
} from "./types.js";

export interface AutonomousRunnerDeps {
  sendMessage: (channelName: string, recipient: string, text: string) => Promise<void>;
  sendWithKeyboard: (channelName: string, recipient: string, text: string, keyboard: InlineKeyboardMarkup) => Promise<string | undefined>;
  editMessageRemoveKeyboard?: (channelName: string, recipient: string, messageId: string, text: string) => Promise<void>;
}

export class AutonomousRunner {
  private task: AutonomousTask | null = null;
  private deps: AutonomousRunnerDeps;
  private approvalResolver?: (approved: boolean) => void;
  private questionResolver?: (answer: string) => void;
  private abortController?: AbortController;

  constructor(deps: AutonomousRunnerDeps) {
    this.deps = deps;
  }

  /** Get current task (if any) */
  getTask(): AutonomousTask | null {
    return this.task;
  }

  /** Check if a sender has a pending question */
  hasPendingQuestion(sender: string): boolean {
    return !!(this.task && this.task.sender === sender && this.task.status === "paused" && this.questionResolver);
  }

  /** Handle a text reply from the user (for pending questions) */
  handleUserReply(sender: string, text: string): boolean {
    if (!this.hasPendingQuestion(sender)) return false;
    this.questionResolver?.(text);
    this.questionResolver = undefined;
    return true;
  }

  /** Handle an inline keyboard callback query */
  async handleCallbackQuery(query: CallbackQuery): Promise<void> {
    if (!query.data || !this.task) return;

    const [action, taskId] = query.data.split(":");
    if (taskId !== this.task.id) return;

    if (action === "approve" || action === "reject") {
      const approved = action === "approve";

      // Remove the keyboard from the message
      if (query.message && this.deps.editMessageRemoveKeyboard) {
        const chatId = String(query.message.chat.id);
        const msgId = String(query.message.message_id);
        const label = approved ? "Approved" : "Rejected";
        await this.deps.editMessageRemoveKeyboard(
          this.task.channelName,
          chatId,
          msgId,
          `${this.task.planText}\n\n${label} by @${query.from.username ?? query.from.id}`,
        );
      }

      this.approvalResolver?.(approved);
      this.approvalResolver = undefined;
    }
  }

  /** Start a new autonomous task */
  startTask(opts: {
    description: string;
    sender: string;
    chatId: string;
    channelName: string;
    mode: string;
    cwd: string;
  }): { taskId: string } | { error: string } {
    if (this.task && !["completed", "cancelled", "failed"].includes(this.task.status)) {
      return { error: `Task ${this.task.id} is already running (${this.task.status}). Use /auto cancel first.` };
    }

    const taskId = randomUUID().slice(0, 8);
    this.task = {
      id: taskId,
      description: opts.description,
      sender: opts.sender,
      chatId: opts.chatId,
      channelName: opts.channelName,
      mode: opts.mode,
      cwd: opts.cwd,
      status: "planning",
      phases: [],
      currentPhase: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.saveState();

    // Run lifecycle in background (non-blocking)
    this.runTaskLifecycle().catch((err) => {
      console.error(`[auto] Task ${taskId} lifecycle error:`, err);
      if (this.task?.id === taskId) {
        this.task.status = "failed";
        this.task.error = err instanceof Error ? err.message : String(err);
        this.task.updatedAt = Date.now();
        this.saveState();
        this.notify(`[auto:${taskId}] Task failed: ${this.task.error}`);
      }
    });

    return { taskId };
  }

  /** Cancel the running task */
  cancel(): string {
    if (!this.task || ["completed", "cancelled", "failed"].includes(this.task.status)) {
      return "No active task to cancel.";
    }

    const taskId = this.task.id;
    this.task.status = "cancelled";
    this.task.updatedAt = Date.now();
    this.saveState();

    // Reject any pending approval or question
    this.approvalResolver?.(false);
    this.approvalResolver = undefined;
    this.questionResolver?.("__cancelled__");
    this.questionResolver = undefined;

    // Abort any running Claude Code process
    this.abortController?.abort();

    return `Task ${taskId} cancelled.`;
  }

  /** Get status summary */
  getStatus(): string {
    if (!this.task) return "No autonomous task running.";

    const t = this.task;
    const elapsed = Math.round((Date.now() - t.createdAt) / 1000);
    const completedPhases = t.phases.filter(p => p.status === "completed").length;
    const totalPhases = t.phases.length;

    let status = `[auto:${t.id}] ${t.status}`;
    if (totalPhases > 0) {
      status += ` | Phase ${completedPhases}/${totalPhases}`;
    }
    status += ` | ${elapsed}s elapsed`;
    status += `\nTask: ${t.description}`;

    if (t.pendingQuestion) {
      status += `\n\nPending question: ${t.pendingQuestion.question}`;
    }

    return status;
  }

  /** Check if task was cancelled (avoids TS narrowing issues with literal types) */
  private isCancelled(): boolean {
    return this.task?.status === "cancelled";
  }

  // ---------------------------------------------------------------------------
  // Private lifecycle
  // ---------------------------------------------------------------------------

  private async runTaskLifecycle(): Promise<void> {
    const task = this.task!;

    // 1. Planning phase
    await this.notify(`[auto:${task.id}] Starting planning phase...`);
    task.status = "planning";
    this.saveState();

    const planResult = await this.runPlanning();
    if (this.isCancelled()) return;

    if (!planResult) {
      task.status = "failed";
      task.error = "Planning produced no output";
      this.saveState();
      await this.notify(`[auto:${task.id}] Planning failed — no output.`);
      return;
    }

    // Parse phases from plan
    const phases = this.parsePlan(planResult);
    if (phases.length === 0) {
      task.status = "failed";
      task.error = "Could not parse phases from plan";
      this.saveState();
      await this.notify(`[auto:${task.id}] Planning failed — no phases found.`);
      return;
    }

    task.phases = phases;
    task.planText = planResult;
    this.saveState();

    // 2. Approval
    task.status = "awaiting_approval";
    this.saveState();

    const approved = await this.requestApproval(planResult);
    if (!approved || this.isCancelled()) {
      if (!this.isCancelled()) {
        task.status = "cancelled";
        task.updatedAt = Date.now();
        this.saveState();
      }
      await this.notify(`[auto:${task.id}] Task rejected.`);
      return;
    }

    // 3. Execute phases
    task.status = "running";
    this.saveState();

    for (let i = 0; i < task.phases.length; i++) {
      if (this.isCancelled()) return;

      task.currentPhase = i;
      const phase = task.phases[i];
      phase.status = "running";
      phase.startedAt = Date.now();
      this.saveState();

      await this.notify(`[auto:${task.id}] Phase ${i + 1}/${task.phases.length}: ${phase.title}`);

      try {
        await this.runPhase(phase, i, task.phases.length);
        phase.status = "completed";
        phase.completedAt = Date.now();
        this.saveState();
      } catch (err) {
        if (this.isCancelled()) return;

        const errorMsg = err instanceof Error ? err.message : String(err);
        phase.status = "failed";
        phase.error = errorMsg;
        this.saveState();

        await this.notify(`[auto:${task.id}] Phase ${i + 1} failed: ${errorMsg}\n\nReply "continue" to skip this phase or "abort" to cancel.`);

        // Pause and wait for user decision
        const answer = await this.askUser(`Phase ${i + 1} failed. Continue or abort?`);
        if (answer.toLowerCase().includes("abort") || answer === "__cancelled__") {
          task.status = "cancelled";
          this.saveState();
          await this.notify(`[auto:${task.id}] Task aborted.`);
          return;
        }
        // Continue to next phase
      }
    }

    // 4. Complete
    task.status = "completed";
    task.completedAt = Date.now();
    this.saveState();

    const totalTime = Math.round((task.completedAt - task.createdAt) / 1000);
    const completed = task.phases.filter(p => p.status === "completed").length;
    await this.notify(
      `[auto:${task.id}] Task completed!\nPhases: ${completed}/${task.phases.length} completed\nTotal time: ${totalTime}s\nCheck PROGRESS.md for full details.`,
    );
  }

  private async runPlanning(): Promise<string | null> {
    const task = this.task!;

    const planPrompt = `You are an autonomous coding agent. The user has requested the following task:

"${task.description}"

Working directory: ${task.cwd}

Your job is to:
1. Explore the repository/directory structure to understand the codebase
2. Create a phased execution plan
3. Write a PROGRESS.md file in the working directory with the plan

Format your plan with clearly numbered phases using this exact format:
### Phase 1: <title>
<description of what this phase does>

### Phase 2: <title>
<description>

(and so on)

Each phase should be a self-contained unit of work that can be executed independently.
Keep the number of phases reasonable (2-6 phases for most tasks).

After writing the plan, output the full plan text as your final response.`;

    try {
      const result = await runClaudeCode({
        prompt: planPrompt,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        cwd: task.cwd,
        maxTurns: 30,
      });
      return result.text;
    } catch (err) {
      console.error(`[auto] Planning failed:`, err);
      return null;
    }
  }

  private parsePlan(planText: string): TaskPhase[] {
    const phases: TaskPhase[] = [];
    // Match "### Phase N: Title" followed by description until next phase or end
    const phaseRegex = /###\s*Phase\s+(\d+)\s*:\s*(.+?)(?:\n)([\s\S]*?)(?=###\s*Phase\s+\d+|$)/gi;

    let match: RegExpExecArray | null;
    while ((match = phaseRegex.exec(planText)) !== null) {
      phases.push({
        id: parseInt(match[1], 10),
        title: match[2].trim(),
        description: match[3].trim(),
        status: "pending",
      });
    }

    // Fallback: try "## Phase N" or numbered list
    if (phases.length === 0) {
      const altRegex = /##\s*Phase\s+(\d+)\s*[:\-]\s*(.+?)(?:\n)([\s\S]*?)(?=##\s*Phase\s+\d+|$)/gi;
      while ((match = altRegex.exec(planText)) !== null) {
        phases.push({
          id: parseInt(match[1], 10),
          title: match[2].trim(),
          description: match[3].trim(),
          status: "pending",
        });
      }
    }

    return phases;
  }

  private async requestApproval(planText: string): Promise<boolean> {
    const task = this.task!;

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "Approve", callback_data: `approve:${task.id}` },
          { text: "Reject", callback_data: `reject:${task.id}` },
        ],
      ],
    };

    // Truncate plan for Telegram (4096 char limit)
    const maxLen = 3800;
    const displayPlan = planText.length > maxLen
      ? planText.slice(0, maxLen) + "\n\n... (truncated)"
      : planText;

    const msgText = `PLAN for task ${task.id}:\n\n${displayPlan}`;

    await this.deps.sendWithKeyboard(task.channelName, task.chatId, msgText, keyboard);

    // Wait for approval via callback query
    return new Promise<boolean>((resolve) => {
      this.approvalResolver = resolve;

      // Timeout after 30 minutes
      setTimeout(() => {
        if (this.approvalResolver === resolve) {
          this.approvalResolver = undefined;
          resolve(false);
        }
      }, 30 * 60 * 1000);
    });
  }

  private async runPhase(phase: TaskPhase, phaseIndex: number, totalPhases: number): Promise<void> {
    const task = this.task!;

    const phasePrompt = `You are an autonomous coding agent executing phase ${phaseIndex + 1} of ${totalPhases}.

Overall task: "${task.description}"
Current phase: "${phase.title}"
Phase description: ${phase.description}
Working directory: ${task.cwd}

Instructions:
1. First, read PROGRESS.md in the working directory if it exists to understand prior work
2. Execute the work described for this phase
3. Update PROGRESS.md with what you accomplished in this phase
4. Commit your changes with a descriptive commit message prefixed with "auto: "

Focus only on this phase's work. Be thorough but stay within scope.`;

    this.abortController = new AbortController();

    const result = await runClaudeCode({
      prompt: phasePrompt,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      cwd: task.cwd,
      maxTurns: 50,
    });

    if (!result.text) {
      throw new Error("Phase produced no output");
    }
  }

  private async askUser(question: string): Promise<string> {
    const task = this.task!;
    task.status = "paused";
    task.pendingQuestion = { id: randomUUID().slice(0, 8), question, askedAt: Date.now() };
    this.saveState();

    return new Promise<string>((resolve) => {
      this.questionResolver = resolve;

      // Timeout after 30 minutes
      setTimeout(() => {
        if (this.questionResolver === resolve) {
          this.questionResolver = undefined;
          resolve("abort");
        }
      }, 30 * 60 * 1000);
    });
  }

  private async notify(text: string): Promise<void> {
    if (!this.task) return;
    try {
      await this.deps.sendMessage(this.task.channelName, this.task.chatId, text);
    } catch (err) {
      console.error(`[auto] Failed to send notification:`, err);
    }
  }

  private saveState(): void {
    if (!this.task) return;
    try {
      const dir = resolve(homedir(), ".jarvis", "tasks", this.task.id);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "state.json"), JSON.stringify(this.task, null, 2));
    } catch (err) {
      console.error(`[auto] Failed to save state:`, err);
    }
  }
}
