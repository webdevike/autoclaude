import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import type { AgentSession as PiAgentSession } from "@mariozechner/pi-coding-agent";
import {
  createPiSession,
  createAuthStorage,
  promptWithStreaming,
  promptSimple,
  parseModelString,
} from "./pi-session.js";
import { createCoreTools } from "./tools/core-tools.js";
import type {
  AgentResponse,
  AgentSession,
  Message,
  ModeConfig,
  ModelTier,
  StatusUpdate,
  ToolDefinition,
  SessionEntry,
  StreamProgressEvent,
} from "./types.js";

// Import extensions
import gmailExtension from "@jarvis/extensions/gmail/index.js";
import exaExtension from "@jarvis/extensions/exa/index.js";
import linearExtension from "@jarvis/extensions/linear/index.js";
import notionExtension from "@jarvis/extensions/notion/index.js";

// Define extensions array
const EXTENSIONS = [
  gmailExtension,
  exaExtension,
  linearExtension,
  notionExtension,
];

const DELEGATION_SYSTEM_PROMPT = `You are a triage agent. Your job is to decide whether to handle a request yourself or delegate it to a smarter, more capable agent.

Handle it yourself if:
- It's a simple question or greeting
- It's a status check
- It requires a quick factual answer
- It's a simple command (switch mode, list crons, etc.)

Delegate to a smart agent if:
- It requires complex reasoning or analysis
- It involves writing or reviewing code
- It requires multi-step planning
- It involves working with integrations (Notion, Linear, Gmail)
- The user explicitly asks for deep work

When delegating, respond with exactly:
DELEGATE: <concise task description for the smart agent>

When handling yourself, just respond normally.`;

// Cost per 1M tokens (input/output) in USD
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },
  "claude-sonnet-4": { input: 3.0, output: 15.0 },
  "claude-3.5-haiku": { input: 0.8, output: 4.0 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "anthropic/claude-3.5-sonnet": { input: 3.0, output: 15.0 },
  "anthropic/claude-3.5-haiku": { input: 0.8, output: 4.0 },
  "anthropic/claude-sonnet-4": { input: 3.0, output: 15.0 },
  "openai/gpt-4o": { input: 2.5, output: 10.0 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Try exact match first
  let costs = MODEL_COSTS[model];

  // Try partial match on model name
  if (!costs) {
    for (const [key, value] of Object.entries(MODEL_COSTS)) {
      if (model.includes(key) || key.includes(model)) {
        costs = value;
        break;
      }
    }
  }

  if (!costs) {
    costs = { input: 0, output: 0 };
  }

  return (costs.input * inputTokens / 1_000_000) + (costs.output * outputTokens / 1_000_000);
}

// ============================================================================
// Session Persistence (JSONL)
// ============================================================================

class SessionManager {
  private sessionDir: string;

  constructor(userId: string) {
    this.sessionDir = resolve(homedir(), ".jarvis", "sessions", userId);
    if (!existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  private getFilePath(): string {
    return resolve(this.sessionDir, "messages.jsonl");
  }

  appendSession(entry: SessionEntry): void {
    const line = JSON.stringify(entry) + "\n";
    appendFileSync(this.getFilePath(), line, "utf-8");
  }

  loadSession(limit = 50): SessionEntry[] {
    const filePath = this.getFilePath();
    if (!existsSync(filePath)) {
      return [];
    }

    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(l => l.trim());

    // Return last N entries
    const entries = lines.slice(-limit).map(line => {
      try {
        return JSON.parse(line) as SessionEntry;
      } catch {
        return null;
      }
    }).filter((e): e is SessionEntry => e !== null);

    // Compact if file is too large (more than 2x limit)
    if (lines.length > limit * 2) {
      this.compactSession(entries);
    }

    return entries;
  }

  private compactSession(entries: SessionEntry[]): void {
    const filePath = this.getFilePath();
    const newContent = entries.map(e => JSON.stringify(e)).join("\n") + "\n";
    // Overwrite the file with compacted entries
    writeFileSync(filePath, newContent, "utf-8");
  }

  getUsageStats(timeRange: "today" | "month"): Record<string, { inputTokens: number; outputTokens: number; cost: number }> {
    const entries = this.loadSession(10000); // Load more for stats
    const now = Date.now();
    const startTime = timeRange === "today"
      ? now - 24 * 60 * 60 * 1000
      : now - 30 * 24 * 60 * 60 * 1000;

    const stats: Record<string, { inputTokens: number; outputTokens: number; cost: number }> = {};

    for (const entry of entries) {
      if (entry.timestamp < startTime || !entry.usage) continue;

      const model = entry.usage.model;
      if (!stats[model]) {
        stats[model] = { inputTokens: 0, outputTokens: 0, cost: 0 };
      }

      stats[model].inputTokens += entry.usage.inputTokens;
      stats[model].outputTokens += entry.usage.outputTokens;
      stats[model].cost += entry.usage.cost;
    }

    return stats;
  }
}

// ============================================================================
// Agent Orchestrator
// ============================================================================

export class AgentOrchestrator {
  private sessions: Map<string, AgentSession> = new Map();
  private tools: Map<string, ToolDefinition> = new Map();
  private modes: Map<string, ModeConfig> = new Map();
  private activeMode: string = "personal";
  private onStatusUpdate?: (update: StatusUpdate) => void;
  private sessionManagers: Map<string, SessionManager> = new Map();

  // Pi session components (shared across all calls)
  private authStorage = createAuthStorage();

  setStatusHandler(handler: (update: StatusUpdate) => void): void {
    this.onStatusUpdate = handler;
  }

  registerMode(config: ModeConfig): void {
    this.modes.set(config.mode, config);
  }

  getActiveMode(): string {
    return this.activeMode;
  }

  switchMode(mode: string): ModeConfig | null {
    const config = this.modes.get(mode);
    if (config) {
      this.activeMode = mode;
    }
    return config ?? null;
  }

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  getSession(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  private getSessionManager(userId: string): SessionManager {
    if (!this.sessionManagers.has(userId)) {
      this.sessionManagers.set(userId, new SessionManager(userId));
    }
    return this.sessionManagers.get(userId)!;
  }

  /** Main entry point: process an incoming message */
  async handleMessage(
    msg: Message,
    onProgress?: (event: StreamProgressEvent) => void,
  ): Promise<AgentResponse> {
    const modeConfig = this.modes.get(msg.mode ?? this.activeMode);
    if (!modeConfig) {
      return { text: `Unknown mode: ${msg.mode}. Available: ${Array.from(this.modes.keys()).join(", ")}` };
    }

    const sessionManager = this.getSessionManager(msg.sender);

    // Check for built-in commands
    const cmdResponse = this.handleCommand(msg.text, msg.sender);
    if (cmdResponse) {
      // Log command to session
      sessionManager.appendSession({
        timestamp: Date.now(),
        role: "user",
        content: msg.text,
      });
      sessionManager.appendSession({
        timestamp: Date.now(),
        role: "assistant",
        content: cmdResponse.text,
      });
      return cmdResponse;
    }

    // Log user message
    sessionManager.appendSession({
      timestamp: Date.now(),
      role: "user",
      content: msg.text,
    });

    // Load conversation history for context
    const history = sessionManager.loadSession(50);
    const contextSummary = history
      .slice(-10)
      .map(entry => `${entry.role}: ${entry.content.slice(0, 200)}`)
      .join("\n");

    // Triage: ask the cheap model whether to handle or delegate
    onProgress?.({ type: "status", text: "Triaging request..." });

    // Include both registered tools and core tools
    const cwd = modeConfig.cwd || process.cwd();
    const coreTools = createCoreTools(cwd);
    const coreToolNames = coreTools.map(t => t.name);
    const registeredToolNames = Array.from(this.tools.keys());
    const allToolNames = [...registeredToolNames, ...coreToolNames];

    const triagePrompt = allToolNames.length
      ? `${DELEGATION_SYSTEM_PROMPT}\n\nAvailable tools: ${allToolNames.join(", ")}\n\nIf the user's request could benefit from any of these tools, ALWAYS delegate.`
      : DELEGATION_SYSTEM_PROMPT;

    const triageSystemPrompt = contextSummary
      ? `${triagePrompt}\n\n## Recent conversation context:\n${contextSummary}`
      : triagePrompt;

    try {
      console.log(`[orchestrator] Creating triage session with model: ${modeConfig.triage.model}`);

      const { session: triageSession } = await createPiSession({
        modelString: modeConfig.triage.model,
        systemPrompt: triageSystemPrompt,
        authStorage: this.authStorage,
      });

      const triageResponse = await promptSimple(triageSession, msg.text);

      console.log(`[orchestrator] Triage response: ${triageResponse.slice(0, 200)}`);

      // Log triage response (usage estimation - SDK doesn't expose exact tokens easily)
      sessionManager.appendSession({
        timestamp: Date.now(),
        role: "assistant",
        content: triageResponse,
        usage: {
          inputTokens: Math.ceil(triageSystemPrompt.length / 4) + Math.ceil(msg.text.length / 4),
          outputTokens: Math.ceil(triageResponse.length / 4),
          model: modeConfig.triage.model,
          cost: calculateCost(modeConfig.triage.model, 500, 100), // Rough estimate
        },
      });

      const delegateIdx = triageResponse.indexOf("DELEGATE:");

      if (delegateIdx !== -1) {
        const taskDescription = triageResponse.slice(delegateIdx + "DELEGATE:".length).trim();
        onProgress?.({ type: "status", text: "Delegating to smart agent..." });
        return this.delegateToSmart(taskDescription, modeConfig, msg.sender, contextSummary, onProgress);
      }

      // Triage handled it directly
      if (triageResponse.trim()) {
        onProgress?.({ type: "done", finalText: triageResponse });
        return { text: triageResponse };
      }

      // Empty response from triage - fall through to smart agent
      console.log(`[orchestrator] Triage returned empty, escalating to smart agent`);
      onProgress?.({ type: "status", text: "Escalating to smart agent..." });
      return this.delegateToSmart(msg.text, modeConfig, msg.sender, contextSummary, onProgress);

    } catch (err) {
      console.error(`[orchestrator] Triage error:`, err);

      // If triage fails, try smart agent directly
      onProgress?.({ type: "status", text: "Triage failed, trying smart agent..." });
      return this.delegateToSmart(msg.text, modeConfig, msg.sender, contextSummary, onProgress);
    }
  }

  /** Delegate work to a smart agent using Pi SDK */
  private async delegateToSmart(
    task: string,
    modeConfig: ModeConfig,
    userId: string,
    contextSummary: string,
    onProgress?: (event: StreamProgressEvent) => void,
  ): Promise<AgentResponse> {
    const sessionId = randomUUID().slice(0, 8);

    const session: AgentSession = {
      id: sessionId,
      tier: "smart",
      mode: modeConfig.mode,
      startedAt: Date.now(),
      status: "running",
    };

    this.sessions.set(sessionId, session);

    onProgress?.({ type: "status", text: `Working on: ${task.slice(0, 60)}...` });
    const result = await this.runSmartAgent(sessionId, task, modeConfig, userId, contextSummary, onProgress);
    return { text: result, metadata: { sessionId } };
  }

  /** Execute the smart agent using Pi SDK */
  private async runSmartAgent(
    sessionId: string,
    task: string,
    modeConfig: ModeConfig,
    userId: string,
    contextSummary: string,
    onProgress?: (event: StreamProgressEvent) => void,
  ): Promise<string> {
    const session = this.sessions.get(sessionId)!;
    const sessionManager = this.getSessionManager(userId);

    // Build system prompt with context
    const smartSystemPrompt = contextSummary
      ? `${modeConfig.systemPrompt}\n\n## Recent conversation context:\n${contextSummary}`
      : modeConfig.systemPrompt;

    try {
      console.log(`[orchestrator] Creating smart session with model: ${modeConfig.smart.model}`);

      // Create core tools for this session
      const cwd = modeConfig.cwd || process.cwd();
      const tools = createCoreTools(cwd);

      const { session: piSession } = await createPiSession({
        modelString: modeConfig.smart.model,
        systemPrompt: smartSystemPrompt,
        maxTokens: modeConfig.smart.maxTokens,
        authStorage: this.authStorage,
        tools,
        cwd,
        extensions: EXTENSIONS,
      });

      const finalText = await promptWithStreaming(piSession, task, onProgress);

      console.log(`[orchestrator] Smart response: ${finalText.slice(0, 200)}`);

      // Log final response with estimated usage
      sessionManager.appendSession({
        timestamp: Date.now(),
        role: "assistant",
        content: finalText,
        usage: {
          inputTokens: Math.ceil(smartSystemPrompt.length / 4) + Math.ceil(task.length / 4),
          outputTokens: Math.ceil(finalText.length / 4),
          model: modeConfig.smart.model,
          cost: calculateCost(modeConfig.smart.model, 1000, 500), // Rough estimate
        },
      });

      session.status = "completed";
      session.lastUpdate = finalText;
      this.emitStatus(sessionId, `Completed: ${finalText.slice(0, 200)}`);

      return finalText || "I processed your request but couldn't generate a response.";

    } catch (err) {
      console.error(`[orchestrator] Smart agent error:`, err);
      session.status = "failed";
      session.lastUpdate = `Error: ${err instanceof Error ? err.message : "Unknown error"}`;
      this.emitStatus(sessionId, session.lastUpdate);

      throw err;
    }
  }

  /** Handle built-in slash commands */
  private handleCommand(text: string, userId: string): AgentResponse | null {
    const trimmed = text.trim();

    if (trimmed === "/mode" || trimmed === "/modes") {
      const modes = Array.from(this.modes.keys());
      return {
        text: `Active mode: ${this.activeMode}\nAvailable: ${modes.join(", ")}`,
      };
    }

    if (trimmed.startsWith("/mode ")) {
      const newMode = trimmed.slice(6).trim();
      const config = this.switchMode(newMode);
      if (config) {
        return { text: `Switched to ${newMode} mode.` };
      }
      return { text: `Unknown mode: ${newMode}` };
    }

    if (trimmed === "/sessions") {
      const sessions = this.getSessions();
      if (sessions.length === 0) {
        return { text: "No active agent sessions." };
      }
      const lines = sessions.map(
        (s) =>
          `[${s.id}] ${s.tier} | ${s.mode} | ${s.status} | ${s.lastUpdate ?? "no update"}`,
      );
      return { text: lines.join("\n") };
    }

    if (trimmed.startsWith("/peek ")) {
      const sessionId = trimmed.slice(6).trim();
      const session = this.sessions.get(sessionId);
      if (!session) {
        return { text: `Session ${sessionId} not found.` };
      }
      return { text: `[${session.id}] ${session.tier} | ${session.mode} | ${session.status}\nLast update: ${session.lastUpdate ?? "no update"}` };
    }

    if (trimmed === "/peek") {
      const sessions = this.getSessions();
      if (sessions.length === 0) {
        return { text: "No active sessions." };
      }
      const lines = sessions.map(s => `${s.id}: ${s.status}`);
      return { text: `Active sessions:\n${lines.join("\n")}` };
    }

    if (trimmed === "/usage today" || trimmed === "/usage") {
      const sessionManager = this.getSessionManager(userId);
      const stats = sessionManager.getUsageStats("today");

      if (Object.keys(stats).length === 0) {
        return { text: "No usage recorded today." };
      }

      const lines = Object.entries(stats).map(([model, data]) => {
        return `${model}: ${data.inputTokens.toLocaleString()} in / ${data.outputTokens.toLocaleString()} out / $${data.cost.toFixed(4)}`;
      });

      const totalCost = Object.values(stats).reduce((sum, data) => sum + data.cost, 0);
      lines.push(`\nTotal: $${totalCost.toFixed(4)}`);

      return { text: `Usage today:\n${lines.join("\n")}` };
    }

    if (trimmed === "/usage month") {
      const sessionManager = this.getSessionManager(userId);
      const stats = sessionManager.getUsageStats("month");

      if (Object.keys(stats).length === 0) {
        return { text: "No usage recorded this month." };
      }

      const lines = Object.entries(stats).map(([model, data]) => {
        return `${model}: ${data.inputTokens.toLocaleString()} in / ${data.outputTokens.toLocaleString()} out / $${data.cost.toFixed(4)}`;
      });

      const totalCost = Object.values(stats).reduce((sum, data) => sum + data.cost, 0);
      lines.push(`\nTotal: $${totalCost.toFixed(4)}`);

      return { text: `Usage this month:\n${lines.join("\n")}` };
    }

    return null;
  }

  private emitStatus(sessionId: string, summary: string): void {
    if (this.onStatusUpdate) {
      this.onStatusUpdate({
        sessionId,
        summary,
        timestamp: Date.now(),
      });
    }
  }
}
