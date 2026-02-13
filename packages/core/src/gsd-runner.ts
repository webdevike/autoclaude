/**
 * GSD Runner — Telegram-driven GSD development lifecycle.
 *
 * Each GSD operation runs a fresh Claude Code session (preventing context rot).
 * Interactive commands (init, discuss) resume the same session for Q&A.
 * Plan approval uses Telegram inline keyboards.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { runClaudeCode } from "./claude-code-delegate.js";
import { buildGsdPrompt } from "./gsd-prompt-builder.js";
import type { GsdProject, GsdState, GsdStatus, GsdOperation } from "./gsd-types.js";
import type { InlineKeyboardMarkup, CallbackQuery } from "./types.js";

const WORKSPACE_ROOT = "/home/ike/workspace";
const STATE_FILE = resolve(homedir(), ".jarvis", "gsd", "projects.json");
const MAX_TURNS_DEFAULT = 50;
const APPROVAL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const NOTIFY_THROTTLE_MS = 5000; // 5 seconds between progress edits

export interface GsdRunnerDeps {
  sendMessage: (channelName: string, recipient: string, text: string) => Promise<void>;
  sendWithKeyboard: (channelName: string, recipient: string, text: string, keyboard: InlineKeyboardMarkup) => Promise<string | undefined>;
  editMessageRemoveKeyboard?: (channelName: string, recipient: string, messageId: string, text: string) => Promise<void>;
}

export class GsdRunner {
  private state: GsdState;
  private deps: GsdRunnerDeps;
  private approvalResolver?: (approved: boolean) => void;
  private questionResolver?: (answer: string) => void;
  private abortController?: AbortController;
  private lastNotifyTime = 0;

  constructor(deps: GsdRunnerDeps) {
    this.deps = deps;
    this.state = this.loadState();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Check if a sender has a pending question from a GSD operation */
  hasPendingQuestion(sender: string): boolean {
    const project = this.getActiveProject();
    return !!(project && project.sender === sender && project.status === "paused" && this.questionResolver);
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
    if (!query.data) return;

    const [action, projectId] = query.data.split(":");
    const project = this.state.projects[projectId];
    if (!project) return;

    if (action === "gsd_approve" || action === "gsd_reject") {
      const approved = action === "gsd_approve";

      // Remove the keyboard from the message
      if (query.message && this.deps.editMessageRemoveKeyboard) {
        const chatId = String(query.message.chat.id);
        const msgId = String(query.message.message_id);
        const label = approved ? "Approved" : "Rejected";
        await this.deps.editMessageRemoveKeyboard(
          project.channelName,
          chatId,
          msgId,
          `Plan ${label} by @${query.from.username ?? query.from.id}`,
        );
      }

      this.approvalResolver?.(approved);
      this.approvalResolver = undefined;
    }
  }

  /** Main command router. Returns true if handled. */
  async handleCommand(
    text: string,
    sender: string,
    chatId: string,
    channelName: string,
  ): Promise<string | null> {
    const parts = text.replace(/^\/gsd\s*/, "").trim().split(/\s+/);
    const subcommand = parts[0]?.toLowerCase() || "";
    const args = parts.slice(1).join(" ");

    switch (subcommand) {
      case "":
      case "help":
        return this.getHelp();

      case "status":
        return this.getStatus();

      case "projects":
        return this.listProjects();

      case "use":
        return this.switchProject(args);

      case "cancel":
        return this.cancel();

      case "init":
        this.runGsdInit(args, sender, chatId, channelName);
        return null; // async — will notify via Telegram

      case "progress":
        this.runGsdProgress(sender, chatId, channelName);
        return null;

      case "discuss":
        this.runGsdDiscuss(args, sender, chatId, channelName);
        return null;

      case "plan":
        this.runGsdPlan(args, sender, chatId, channelName);
        return null;

      case "execute":
        this.runGsdExecute(args, sender, chatId, channelName);
        return null;

      case "verify":
        this.runGsdVerify(args, sender, chatId, channelName);
        return null;

      default:
        return `Unknown GSD command: ${subcommand}\n\nUse /gsd help for available commands.`;
    }
  }

  // ---------------------------------------------------------------------------
  // Info commands (instant, no Claude Code)
  // ---------------------------------------------------------------------------

  private getHelp(): string {
    return `*GSD Project Lifecycle*

/gsd init <name> <description> — Initialize new project
/gsd progress — Check progress & suggested next action
/gsd discuss <phase> — Clarify phase requirements
/gsd plan <phase> — Generate execution plan (requires approval)
/gsd execute <phase> — Execute approved plan
/gsd verify [phase] — Validate built features

*Management:*
/gsd status — Current project state
/gsd projects — List all projects
/gsd use <name> — Switch active project
/gsd cancel — Abort current operation`;
  }

  private getStatus(): string {
    const project = this.getActiveProject();
    if (!project) return "No active GSD project. Use /gsd init <name> <description> to start.";

    const elapsed = Math.round((Date.now() - project.updatedAt) / 1000);
    let status = `[gsd:${project.name}] ${project.status}`;
    if (project.currentOperation) {
      status += ` (${project.currentOperation.type}`;
      if (project.currentOperation.phase) {
        status += ` phase ${project.currentOperation.phase}`;
      }
      status += `)`;
    }
    status += `\nPath: ${project.repoPath}`;
    status += `\nLast update: ${elapsed}s ago`;

    return status;
  }

  private listProjects(): string {
    const ids = Object.keys(this.state.projects);
    if (ids.length === 0) return "No GSD projects. Use /gsd init to create one.";

    const lines = ids.map((id) => {
      const p = this.state.projects[id];
      const active = this.state.activeProjectId === id ? " (active)" : "";
      return `• ${p.name}${active} — ${p.status} — ${p.repoPath}`;
    });

    return `*GSD Projects:*\n${lines.join("\n")}`;
  }

  private switchProject(name: string): string {
    if (!name) return "Usage: /gsd use <project-name>";

    const entry = Object.entries(this.state.projects).find(
      ([, p]) => p.name === name,
    );
    if (!entry) return `Project "${name}" not found. Use /gsd projects to list.`;

    this.state.activeProjectId = entry[0];
    this.saveState();
    return `Switched to project: ${name}`;
  }

  private cancel(): string {
    const project = this.getActiveProject();
    if (!project) return "No active project.";

    if (project.status === "idle") return "No operation running.";

    project.status = "idle";
    project.currentOperation = undefined;
    project.sessionId = undefined;
    project.updatedAt = Date.now();
    this.saveState();

    // Resolve any pending promises
    this.approvalResolver?.(false);
    this.approvalResolver = undefined;
    this.questionResolver?.("__cancelled__");
    this.questionResolver = undefined;
    this.abortController?.abort();

    return `[gsd:${project.name}] Operation cancelled.`;
  }

  // ---------------------------------------------------------------------------
  // GSD Operations (async, run in background)
  // ---------------------------------------------------------------------------

  private async runGsdInit(
    args: string,
    sender: string,
    chatId: string,
    channelName: string,
  ): Promise<void> {
    // Parse: name and description
    const parts = args.split(/\s+/);
    const name = parts[0];
    const description = parts.slice(1).join(" ");

    if (!name) {
      await this.notify(channelName, chatId, "Usage: /gsd init <name> <description>");
      return;
    }

    // Create project
    const repoPath = resolve(WORKSPACE_ROOT, name);
    const projectId = randomUUID().slice(0, 8);

    const project: GsdProject = {
      id: projectId,
      name,
      repoPath,
      sender,
      chatId,
      channelName,
      status: "initializing",
      currentOperation: { type: "init", startedAt: Date.now() },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.state.projects[projectId] = project;
    this.state.activeProjectId = projectId;
    this.saveState();

    await this.notify(channelName, chatId, `[gsd:${name}] Initializing project at ${repoPath}...`);

    try {
      const prompt = buildGsdPrompt("new-project", description || name, repoPath);
      if (!prompt) {
        await this.notify(channelName, chatId, "[gsd] Error: GSD commands not installed. Run: npx get-shit-done-cc");
        this.setIdle(project);
        return;
      }

      await this.runInteractiveOperation(project, prompt, `Initialize project "${name}": ${description || name}`);
      await this.suggestNext(project, "init");
    } catch (err) {
      await this.handleOperationError(project, "init", err);
    }
  }

  private async runGsdProgress(
    sender: string,
    chatId: string,
    channelName: string,
  ): Promise<void> {
    const project = this.getActiveProject();
    if (!project) {
      await this.notify(channelName, chatId, "No active project. Use /gsd init first.");
      return;
    }

    this.setOperating(project, "progress");
    await this.notify(project.channelName, project.chatId, `[gsd:${project.name}] Checking progress...`);

    try {
      const prompt = buildGsdPrompt("progress", "", project.repoPath);
      if (!prompt) {
        await this.notify(project.channelName, project.chatId, "[gsd] Error: GSD commands not installed.");
        this.setIdle(project);
        return;
      }

      const result = await this.runFreshOperation(project, prompt, "Check project progress and suggest next action");
      await this.sendChunked(project.channelName, project.chatId, result);
      this.setIdle(project);
    } catch (err) {
      await this.handleOperationError(project, "progress", err);
    }
  }

  private async runGsdDiscuss(
    args: string,
    sender: string,
    chatId: string,
    channelName: string,
  ): Promise<void> {
    const project = this.getActiveProject();
    if (!project) {
      await this.notify(channelName, chatId, "No active project. Use /gsd init first.");
      return;
    }

    if (!args) {
      await this.notify(channelName, chatId, "Usage: /gsd discuss <phase-number>");
      return;
    }

    this.setOperating(project, "discuss", parseInt(args, 10) || undefined);
    await this.notify(project.channelName, project.chatId, `[gsd:${project.name}] Starting discussion for phase ${args}...`);

    try {
      const prompt = buildGsdPrompt("discuss-phase", args, project.repoPath);
      if (!prompt) {
        await this.notify(project.channelName, project.chatId, "[gsd] Error: GSD commands not installed.");
        this.setIdle(project);
        return;
      }

      await this.runInteractiveOperation(project, prompt, `Discuss phase ${args} requirements`);
      await this.suggestNext(project, "discuss", parseInt(args, 10) || undefined);
    } catch (err) {
      await this.handleOperationError(project, "discuss", err);
    }
  }

  private async runGsdPlan(
    args: string,
    sender: string,
    chatId: string,
    channelName: string,
  ): Promise<void> {
    const project = this.getActiveProject();
    if (!project) {
      await this.notify(channelName, chatId, "No active project. Use /gsd init first.");
      return;
    }

    if (!args) {
      await this.notify(channelName, chatId, "Usage: /gsd plan <phase-number> [--skip-research] [--gaps]");
      return;
    }

    this.setOperating(project, "plan", parseInt(args, 10) || undefined);
    await this.notify(project.channelName, project.chatId, `[gsd:${project.name}] Planning phase ${args}...`);

    try {
      const prompt = buildGsdPrompt("plan-phase", args, project.repoPath);
      if (!prompt) {
        await this.notify(project.channelName, project.chatId, "[gsd] Error: GSD commands not installed.");
        this.setIdle(project);
        return;
      }

      const result = await this.runFreshOperation(project, prompt, `Plan phase ${args}`, 80);

      // Show plan summary and request approval
      project.status = "awaiting_plan_approval";
      project.updatedAt = Date.now();
      this.saveState();

      const approved = await this.requestApproval(project, result);

      if (!approved) {
        await this.notify(project.channelName, project.chatId, `[gsd:${project.name}] Plan rejected.`);
        this.setIdle(project);
        return;
      }

      // Auto-execute after approval
      await this.notify(project.channelName, project.chatId, `[gsd:${project.name}] Plan approved! Starting execution...`);
      await this.executePhase(project, args);
      await this.suggestNext(project, "plan", parseInt(args, 10) || undefined);
    } catch (err) {
      await this.handleOperationError(project, "plan", err);
    }
  }

  private async runGsdExecute(
    args: string,
    sender: string,
    chatId: string,
    channelName: string,
  ): Promise<void> {
    const project = this.getActiveProject();
    if (!project) {
      await this.notify(channelName, chatId, "No active project. Use /gsd init first.");
      return;
    }

    if (!args) {
      await this.notify(channelName, chatId, "Usage: /gsd execute <phase-number> [--gaps-only]");
      return;
    }

    await this.notify(project.channelName, project.chatId, `[gsd:${project.name}] Executing phase ${args}...`);

    try {
      await this.executePhase(project, args);
      await this.suggestNext(project, "execute", parseInt(args, 10) || undefined);
    } catch (err) {
      await this.handleOperationError(project, "execute", err);
    }
  }

  private async runGsdVerify(
    args: string,
    sender: string,
    chatId: string,
    channelName: string,
  ): Promise<void> {
    const project = this.getActiveProject();
    if (!project) {
      await this.notify(channelName, chatId, "No active project. Use /gsd init first.");
      return;
    }

    this.setOperating(project, "verify", args ? parseInt(args, 10) || undefined : undefined);
    await this.notify(project.channelName, project.chatId, `[gsd:${project.name}] Verifying${args ? ` phase ${args}` : ""}...`);

    try {
      const prompt = buildGsdPrompt("verify-work", args || "", project.repoPath);
      if (!prompt) {
        await this.notify(project.channelName, project.chatId, "[gsd] Error: GSD commands not installed.");
        this.setIdle(project);
        return;
      }

      // Verify is interactive — user may need to confirm test results
      await this.runInteractiveOperation(project, prompt, `Verify ${args ? `phase ${args}` : "project"} features`);
      await this.suggestNext(project, "verify", args ? parseInt(args, 10) || undefined : undefined);
    } catch (err) {
      await this.handleOperationError(project, "verify", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Core execution patterns
  // ---------------------------------------------------------------------------

  /**
   * Run a fresh Claude Code session (no session resume).
   * Used for: progress, plan
   */
  private async runFreshOperation(
    project: GsdProject,
    systemPrompt: string,
    userPrompt: string,
    maxTurns = MAX_TURNS_DEFAULT,
  ): Promise<string> {
    const result = await runClaudeCode({
      prompt: userPrompt,
      systemPrompt,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      cwd: project.repoPath,
      maxTurns,
      onProgress: (event) => this.handleProgress(project, event),
    });
    return result.text;
  }

  /**
   * Run an interactive Claude Code session with session resume for Q&A.
   * Used for: init, discuss, verify
   * Claude may ask questions via its output — user replies route back here.
   */
  private async runInteractiveOperation(
    project: GsdProject,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<void> {
    // Initial run
    const result = await runClaudeCode({
      prompt: userPrompt,
      systemPrompt,
      sessionId: project.sessionId,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      cwd: project.repoPath,
      maxTurns: MAX_TURNS_DEFAULT,
      onProgress: (event) => this.handleProgress(project, event),
    });

    // Store session for resume
    if (result.sessionId) {
      project.sessionId = result.sessionId;
      this.saveState();
    }

    const text = result.text?.trim();
    if (!text) {
      this.setIdle(project);
      return;
    }

    // Send the response
    await this.sendChunked(project.channelName, project.chatId, text);

    // Check if the output looks like it's asking a question
    if (this.looksLikeQuestion(text)) {
      // Pause and wait for user reply
      const answer = await this.askUser(project);
      if (answer === "__cancelled__") {
        this.setIdle(project);
        return;
      }

      // Resume session with user's answer
      await this.runInteractiveResume(project, answer, systemPrompt);
    } else {
      this.setIdle(project);
    }
  }

  /**
   * Resume an interactive session with user's reply.
   */
  private async runInteractiveResume(
    project: GsdProject,
    userReply: string,
    systemPrompt: string,
  ): Promise<void> {
    if (!project.sessionId) {
      this.setIdle(project);
      return;
    }

    project.status = project.currentOperation?.type === "init"
      ? "initializing"
      : project.currentOperation?.type === "discuss"
        ? "discussing"
        : "verifying";
    project.updatedAt = Date.now();
    this.saveState();

    const result = await runClaudeCode({
      prompt: userReply,
      systemPrompt,
      sessionId: project.sessionId,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      cwd: project.repoPath,
      maxTurns: MAX_TURNS_DEFAULT,
      onProgress: (event) => this.handleProgress(project, event),
    });

    if (result.sessionId) {
      project.sessionId = result.sessionId;
      this.saveState();
    }

    const text = result.text?.trim();
    if (!text) {
      this.setIdle(project);
      return;
    }

    await this.sendChunked(project.channelName, project.chatId, text);

    if (this.looksLikeQuestion(text)) {
      const answer = await this.askUser(project);
      if (answer === "__cancelled__") {
        this.setIdle(project);
        return;
      }
      await this.runInteractiveResume(project, answer, systemPrompt);
    } else {
      this.setIdle(project);
    }
  }

  /**
   * Execute a phase via the GSD execute-phase command.
   */
  private async executePhase(project: GsdProject, args: string): Promise<void> {
    this.setOperating(project, "execute", parseInt(args, 10) || undefined);

    const prompt = buildGsdPrompt("execute-phase", args, project.repoPath);
    if (!prompt) {
      await this.notify(project.channelName, project.chatId, "[gsd] Error: GSD commands not installed.");
      this.setIdle(project);
      return;
    }

    const result = await this.runFreshOperation(project, prompt, `Execute phase ${args}`, 100);
    await this.sendChunked(project.channelName, project.chatId, `[gsd:${project.name}] Phase ${args} execution complete.\n\n${result.slice(0, 2000)}`);
    this.setIdle(project);
  }

  // ---------------------------------------------------------------------------
  // Approval flow
  // ---------------------------------------------------------------------------

  private async requestApproval(project: GsdProject, planText: string): Promise<boolean> {
    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "Approve", callback_data: `gsd_approve:${project.id}` },
          { text: "Reject", callback_data: `gsd_reject:${project.id}` },
        ],
      ],
    };

    // Truncate plan for Telegram (4096 char limit)
    const maxLen = 3600;
    const displayPlan = planText.length > maxLen
      ? planText.slice(0, maxLen) + "\n\n... (truncated)"
      : planText;

    const msgText = `[gsd:${project.name}] Plan ready:\n\n${displayPlan}`;

    await this.deps.sendWithKeyboard(project.channelName, project.chatId, msgText, keyboard);

    return new Promise<boolean>((resolve) => {
      this.approvalResolver = resolve;

      setTimeout(() => {
        if (this.approvalResolver === resolve) {
          this.approvalResolver = undefined;
          resolve(false);
        }
      }, APPROVAL_TIMEOUT_MS);
    });
  }

  // ---------------------------------------------------------------------------
  // Question flow (for interactive commands)
  // ---------------------------------------------------------------------------

  private async askUser(project: GsdProject): Promise<string> {
    project.status = "paused";
    project.updatedAt = Date.now();
    this.saveState();

    return new Promise<string>((resolve) => {
      this.questionResolver = resolve;

      setTimeout(() => {
        if (this.questionResolver === resolve) {
          this.questionResolver = undefined;
          resolve("__cancelled__");
        }
      }, APPROVAL_TIMEOUT_MS);
    });
  }

  /** Heuristic: does the text end with a question? */
  private looksLikeQuestion(text: string): boolean {
    const lastLines = text.split("\n").filter(l => l.trim()).slice(-5);
    const tail = lastLines.join("\n");
    // Ends with ? or contains common question patterns
    return /\?\s*$/.test(tail) ||
      /(?:please (?:select|choose|pick|provide|enter|specify)|which (?:one|option)|what (?:would|should|do)|would you like|do you want|shall I)/i.test(tail);
  }

  // ---------------------------------------------------------------------------
  // Progress & notifications
  // ---------------------------------------------------------------------------

  private handleProgress(project: GsdProject, event: import("./types.js").StreamProgressEvent): void {
    // Throttle notifications
    const now = Date.now();
    if (now - this.lastNotifyTime < NOTIFY_THROTTLE_MS) return;
    this.lastNotifyTime = now;

    let statusText: string | undefined;

    if (event.type === "tool_use" && event.toolName) {
      const friendly = this.formatToolName(event.toolName);
      statusText = `[gsd:${project.name}] ${friendly}`;
    } else if (event.type === "status" && event.text) {
      statusText = `[gsd:${project.name}] ${event.text}`;
    }

    if (statusText) {
      // Fire and forget — don't block the stream
      this.notify(project.channelName, project.chatId, statusText).catch(() => {});
    }
  }

  private formatToolName(raw: string): string {
    const map: Record<string, string> = {
      Read: "Reading file...",
      Write: "Writing file...",
      Edit: "Editing file...",
      Bash: "Running command...",
      Glob: "Searching files...",
      Grep: "Searching code...",
      Task: "Running sub-task...",
      WebSearch: "Searching web...",
      WebFetch: "Fetching page...",
    };
    return map[raw] ?? `Using ${raw.replace(/[_-]/g, " ")}...`;
  }

  private async notify(channelName: string, chatId: string, text: string): Promise<void> {
    try {
      await this.deps.sendMessage(channelName, chatId, text);
    } catch (err) {
      console.error(`[gsd] Failed to send notification:`, err);
    }
  }

  /** Send text, splitting into chunks for Telegram's 4096 char limit */
  private async sendChunked(channelName: string, chatId: string, text: string): Promise<void> {
    const maxLen = 4000;
    if (text.length <= maxLen) {
      await this.notify(channelName, chatId, text);
      return;
    }

    // Split on double newlines (paragraph breaks) when possible
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }

      // Find a good split point
      let splitAt = remaining.lastIndexOf("\n\n", maxLen);
      if (splitAt < maxLen * 0.3) {
        splitAt = remaining.lastIndexOf("\n", maxLen);
      }
      if (splitAt < maxLen * 0.3) {
        splitAt = maxLen;
      }

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }

    for (const chunk of chunks) {
      await this.notify(channelName, chatId, chunk);
    }
  }

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  private getActiveProject(): GsdProject | null {
    if (!this.state.activeProjectId) return null;
    return this.state.projects[this.state.activeProjectId] ?? null;
  }

  private setOperating(project: GsdProject, type: GsdOperation["type"], phase?: number): void {
    project.status = type === "init" ? "initializing"
      : type === "discuss" ? "discussing"
      : type === "plan" ? "planning"
      : type === "execute" ? "executing"
      : type === "verify" ? "verifying"
      : "researching" as GsdStatus;
    project.currentOperation = { type, phase, startedAt: Date.now() };
    project.updatedAt = Date.now();
    this.saveState();
  }

  private setIdle(project: GsdProject): void {
    project.status = "idle";
    project.currentOperation = undefined;
    project.sessionId = undefined;
    project.updatedAt = Date.now();
    this.saveState();
  }

  private async suggestNext(
    project: GsdProject,
    completedOp: string,
    phase?: number,
  ): Promise<void> {
    let hint: string;
    switch (completedOp) {
      case "init":
        hint = "Next → /gsd plan 1";
        break;
      case "discuss":
        hint = phase ? `Next → /gsd plan ${phase}` : "Next → /gsd plan <phase>";
        break;
      case "plan":
      case "execute":
        hint = phase ? `Next → /gsd verify ${phase}` : "Next → /gsd verify";
        break;
      case "verify":
        hint = phase ? `Next → /gsd plan ${phase + 1}` : "Next → /gsd progress";
        break;
      default:
        return;
    }
    await this.notify(project.channelName, project.chatId, hint);
  }

  private async handleOperationError(
    project: GsdProject,
    operation: string,
    err: unknown,
  ): Promise<void> {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[gsd] ${operation} error:`, msg);
    await this.notify(project.channelName, project.chatId, `[gsd:${project.name}] ${operation} failed: ${msg}`);
    this.setIdle(project);
  }

  private loadState(): GsdState {
    try {
      if (existsSync(STATE_FILE)) {
        return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      }
    } catch (err) {
      console.warn("[gsd] Failed to load state:", err);
    }
    return { projects: {} };
  }

  private saveState(): void {
    try {
      const dir = resolve(homedir(), ".jarvis", "gsd");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error("[gsd] Failed to save state:", err);
    }
  }
}
