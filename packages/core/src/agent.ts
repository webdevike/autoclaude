import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
import { createConfigTools } from "./tools/config-tools.js";
import { delegateToCodingAgent } from "./coding-delegate.js";
import { PreferencesManager } from "./preferences.js";
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

// Keywords that bypass triage and go directly to specific agents
const CODING_KEYWORDS = [
  /\b(edit|modify|change|update|fix|create|write|add|remove|delete|refactor|implement)\b.*\b(file|code|function|class|component|module|script)\b/i,
  /\b(file|code|bug|error|syntax|compile|build)\b/i,
  /\.(ts|js|tsx|jsx|json|md|py|go|rs|java|cpp|c|html|css|scss)\b/i,
  /^(code|coding):/i,
];

const SMART_KEYWORDS = [
  /\b(search|research|look up|find out|what is|who is|explain|analyze|summarize)\b/i,
  /\b(email|gmail|send email|check email|inbox)\b/i,
  /\b(notion|linear|issue|task|page|database)\b/i,
  /\b(web|internet|online|google|exa)\b/i,
  /^(research|search|find):/i,
];

const SIMPLE_PATTERNS = [
  /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|bye|goodbye)[\s!?.]*$/i,
  /^\//, // slash commands handled separately
];

type FastRouteResult = "coding" | "smart" | "simple" | null;

function fastRoute(text: string): FastRouteResult {
  const trimmed = text.trim();

  // Check for simple patterns first (greetings, etc.)
  for (const pattern of SIMPLE_PATTERNS) {
    if (pattern.test(trimmed)) return "simple";
  }

  // Check for coding keywords
  for (const pattern of CODING_KEYWORDS) {
    if (pattern.test(trimmed)) return "coding";
  }

  // Check for smart/research keywords
  for (const pattern of SMART_KEYWORDS) {
    if (pattern.test(trimmed)) return "smart";
  }

  return null; // needs triage
}

const DELEGATION_SYSTEM_PROMPT = `You are a triage agent. Your job is to decide whether to handle a request yourself or delegate it to a specialized agent.

Handle it yourself if:
- It's a simple question or greeting
- It's a status check
- It requires a quick factual answer
- It's a simple command (switch mode, list crons, etc.)

Delegate to a coding agent if:
- It involves file operations (reading, writing, editing files)
- It requires shell commands or system operations
- It involves code analysis or multi-file changes
- The user explicitly asks for coding work

Delegate to a smart agent if:
- It requires complex reasoning or analysis WITHOUT file operations
- It involves working with integrations (Notion, Linear, Gmail, Exa web search)
- It involves searching the web or looking something up online
- It requires multi-step planning or deep thinking

When delegating to coding agent, respond with exactly:
CODING: <concise task description for the coding agent>

When delegating to smart agent, respond with exactly:
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

interface RetentionPolicy {
  maxMessages: number;     // Default: 50
  maxAgeDays: number;      // Default: 30
  minMessages: number;     // Default: 10 (always keep at least this many)
}

class SessionManager {
  private sessionDir: string;
  private retentionPolicy: RetentionPolicy;

  constructor(userId: string, retentionPolicy?: Partial<RetentionPolicy>) {
    this.sessionDir = resolve(homedir(), ".jarvis", "sessions", userId);
    if (!existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true });
    }

    // Set retention policy with defaults
    this.retentionPolicy = {
      maxMessages: retentionPolicy?.maxMessages ?? 50,
      maxAgeDays: retentionPolicy?.maxAgeDays ?? 30,
      minMessages: retentionPolicy?.minMessages ?? 10,
    };
  }

  private getFilePath(): string {
    return resolve(this.sessionDir, "messages.jsonl");
  }

  appendSession(entry: SessionEntry): void {
    const line = JSON.stringify(entry) + "\n";
    appendFileSync(this.getFilePath(), line, "utf-8");

    // Enforce retention policy after each append
    this.enforceRetentionPolicy();
  }

  loadSession(limit = 50): SessionEntry[] {
    const filePath = this.getFilePath();
    if (!existsSync(filePath)) {
      return [];
    }

    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(l => l.trim());

    // Parse with safe error handling
    let invalidCount = 0;
    const entries: SessionEntry[] = [];

    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as SessionEntry);
      } catch {
        invalidCount++;
        console.warn(`[history] Skipping invalid JSONL line: ${line.slice(0, 100)}`);
      }
    }

    // If >10% invalid lines, backup and rewrite with valid messages
    if (lines.length > 0 && invalidCount / lines.length > 0.1) {
      console.warn(`[history] ${invalidCount}/${lines.length} invalid lines (${(invalidCount / lines.length * 100).toFixed(1)}%), backing up and rewriting`);
      const backupPath = `${filePath}.corrupt.${Date.now()}`;
      writeFileSync(backupPath, content, "utf-8");
      console.log(`[history] Backed up corrupt file to ${backupPath}`);
      this.compactSession(entries);
    }

    // Return last N entries
    const result = entries.slice(-limit);

    // Compact if file is too large (more than 2x limit)
    if (lines.length > limit * 2) {
      this.compactSession(result);
    }

    return result;
  }

  private compactSession(entries: SessionEntry[]): void {
    const filePath = this.getFilePath();
    const newContent = entries.map(e => JSON.stringify(e)).join("\n") + "\n";
    // Atomic write: temp file + rename
    const tempPath = `${filePath}.tmp`;
    writeFileSync(tempPath, newContent, "utf-8");
    writeFileSync(filePath, newContent, "utf-8"); // Node.js doesn't have atomic rename across platforms, use sync overwrite
  }

  private enforceRetentionPolicy(): void {
    const filePath = this.getFilePath();
    if (!existsSync(filePath)) {
      return;
    }

    // Load all messages
    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(l => l.trim());

    // Parse all entries
    const entries: SessionEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as SessionEntry);
      } catch {
        // Skip invalid lines
      }
    }

    const beforeCount = entries.length;

    // If count <= minMessages, skip cleanup
    if (beforeCount <= this.retentionPolicy.minMessages) {
      return;
    }

    const now = Date.now();
    const maxAgeMs = this.retentionPolicy.maxAgeDays * 24 * 60 * 60 * 1000;
    const cutoffTime = now - maxAgeMs;

    // Filter by age and limit
    let filtered = entries.filter(e => e.timestamp >= cutoffTime);
    filtered = filtered.slice(-this.retentionPolicy.maxMessages);

    // Ensure at least minMessages kept
    if (filtered.length < this.retentionPolicy.minMessages) {
      filtered = entries.slice(-this.retentionPolicy.minMessages);
    }

    const afterCount = filtered.length;

    // Only rewrite if we filtered something
    if (afterCount < beforeCount) {
      console.log(`[history] Retention: ${beforeCount} → ${afterCount} messages`);
      this.compactSession(filtered);
    }
  }

  getStats(): { total: number; oldest?: number; newest?: number } {
    const filePath = this.getFilePath();
    if (!existsSync(filePath)) {
      return { total: 0 };
    }

    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(l => l.trim());

    const entries: SessionEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as SessionEntry);
      } catch {
        // Skip invalid lines
      }
    }

    if (entries.length === 0) {
      return { total: 0 };
    }

    const timestamps = entries.map(e => e.timestamp);
    return {
      total: entries.length,
      oldest: Math.min(...timestamps),
      newest: Math.max(...timestamps),
    };
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
  private preferencesManagers: Map<string, PreferencesManager> = new Map();
  private configDir: string;

  // Pi session components (shared across all calls)
  private authStorage = createAuthStorage();

  constructor(configDir?: string) {
    this.configDir = configDir || resolve(process.cwd(), "config");
  }

  setStatusHandler(handler: (update: StatusUpdate) => void): void {
    this.onStatusUpdate = handler;
  }

  registerMode(config: ModeConfig): void {
    this.modes.set(config.mode, config);
  }

  getActiveMode(): string {
    return this.activeMode;
  }

  /** Load all mode configs from disk */
  private loadAllModes(): void {
    if (!existsSync(this.configDir)) {
      console.warn(`[orchestrator] Config directory not found: ${this.configDir}`);
      return;
    }

    const files = readdirSync(this.configDir).filter(f => f.endsWith(".json"));

    for (const file of files) {
      try {
        const filePath = resolve(this.configDir, file);
        const content = readFileSync(filePath, "utf-8");
        const config = JSON.parse(content) as ModeConfig;

        // Handle cwd environment variable substitution
        if (config.cwd) {
          config.cwd = config.cwd.replace(/\$\{([^}]+)\}/g, (_, varName) => {
            return process.env[varName] || config.cwd!;
          });
        }

        this.modes.set(config.mode, config);
        console.log(`[orchestrator] Loaded mode: ${config.mode} from ${file}`);
      } catch (err) {
        console.error(`[orchestrator] Failed to load ${file}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  /** Reload all modes from disk (for dynamic config updates) */
  reloadModes(): void {
    console.log(`[orchestrator] Reloading modes from ${this.configDir}`);
    this.modes.clear();
    this.loadAllModes();
  }

  /** Get list of available mode names */
  getAvailableModes(): string[] {
    return Array.from(this.modes.keys());
  }

  /** Get current mode's configuration */
  getCurrentModeConfig(): ModeConfig | null {
    return this.modes.get(this.activeMode) ?? null;
  }

  /** Switch to a different mode, reloading configs first */
  switchMode(mode: string): { success: boolean; message: string; config?: ModeConfig } {
    // Reload configs from disk to pick up any changes
    this.reloadModes();

    const config = this.modes.get(mode);
    if (config) {
      this.activeMode = mode;
      const availableModes = this.getAvailableModes();
      return {
        success: true,
        message: `Switched to ${mode} mode.\n\nIntegrations: ${config.integrations.join(", ")}\nTone: ${config.tone || "default"}`,
        config,
      };
    }

    const availableModes = this.getAvailableModes();
    return {
      success: false,
      message: `Mode "${mode}" not found.\n\nAvailable modes: ${availableModes.join(", ")}`,
    };
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

  private getPreferencesManager(userId: string): PreferencesManager {
    if (!this.preferencesManagers.has(userId)) {
      this.preferencesManagers.set(userId, new PreferencesManager(userId));
    }
    return this.preferencesManagers.get(userId)!;
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
    const preferencesManager = this.getPreferencesManager(msg.sender);

    // Load preferences for user (lazy initialization)
    preferencesManager.load();

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

    // Fast routing: skip triage for obvious intents
    const fastRouteResult = fastRoute(msg.text);
    const cwd = modeConfig.cwd || process.cwd();

    if (fastRouteResult === "coding") {
      console.log(`[orchestrator] Fast route: coding`);
      onProgress?.({ type: "status", text: "Delegating to coding agent..." });
      return this.delegateToCoding(msg.text, modeConfig, msg.sender, onProgress);
    }

    if (fastRouteResult === "smart") {
      console.log(`[orchestrator] Fast route: smart`);
      onProgress?.({ type: "status", text: "Delegating to smart agent..." });
      return this.delegateToSmart(msg.text, modeConfig, msg.sender, contextSummary, onProgress);
    }

    if (fastRouteResult === "simple") {
      console.log(`[orchestrator] Fast route: simple greeting`);
      // Handle simple greetings directly without any LLM call
      const greetings: Record<string, string> = {
        hi: "Hey! How can I help you today?",
        hello: "Hello! What can I do for you?",
        hey: "Hey there! What's up?",
        thanks: "You're welcome!",
        "thank you": "You're welcome! Let me know if you need anything else.",
        ok: "👍",
        okay: "👍",
        yes: "Got it!",
        no: "Alright, let me know if you change your mind.",
        sure: "Great!",
        bye: "Goodbye! Have a great day!",
        goodbye: "Take care! Feel free to reach out anytime.",
      };
      const key = msg.text.trim().toLowerCase().replace(/[!?.]/g, "");
      const response = greetings[key] || "Hey! How can I help?";
      sessionManager.appendSession({
        timestamp: Date.now(),
        role: "assistant",
        content: response,
      });
      return { text: response };
    }

    // Triage: ask the cheap model whether to handle or delegate
    onProgress?.({ type: "status", text: "Triaging request..." });

    // Include registered tools, core tools, and extension tools
    const coreTools = createCoreTools(cwd);
    const coreToolNames = coreTools.map(t => t.name);
    const registeredToolNames = Array.from(this.tools.keys());
    const extensionToolNames = [
      "exa_search (search the web for anything)",
      "gmail_list_messages (list/search emails)",
      "gmail_read_message (read a specific email)",
      "gmail_send (send an email)",
      "linear_search_issues (search Linear issues)",
      "linear_create_issue (create a Linear issue)",
      "linear_list_teams (list Linear teams)",
      "linear_my_issues (my assigned Linear issues)",
      "notion_search (search Notion pages and databases)",
      "notion_read_page (read a Notion page)",
      "notion_list_databases (list available Notion databases)",
      "notion_create_page (create a Notion page in a database or under a page)",
    ];
    const allToolNames = [...registeredToolNames, ...coreToolNames, ...extensionToolNames];

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

      // Check for coding delegation first
      const codingIdx = triageResponse.indexOf("CODING:");
      if (codingIdx !== -1) {
        const task = triageResponse.slice(codingIdx + "CODING:".length).trim();
        onProgress?.({ type: "status", text: "Delegating to coding agent..." });
        return this.delegateToCoding(task, modeConfig, msg.sender, onProgress);
      }

      // Check for smart agent delegation
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

  /** Delegate work to a coding agent using pi-coding-agent */
  private async delegateToCoding(
    task: string,
    modeConfig: ModeConfig,
    userId: string,
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

    onProgress?.({ type: "status", text: `Coding: ${task.slice(0, 60)}...` });

    try {
      const cwd = modeConfig.cwd || process.cwd();
      const result = await delegateToCodingAgent({
        task,
        cwd,
        modelString: modeConfig.smart.model,
        authStorage: this.authStorage,
        onProgress,
      });

      const sessionManager = this.getSessionManager(userId);
      sessionManager.appendSession({
        timestamp: Date.now(),
        role: "assistant",
        content: result,
        usage: {
          inputTokens: Math.ceil(task.length / 4),
          outputTokens: Math.ceil(result.length / 4),
          model: modeConfig.smart.model,
          cost: calculateCost(modeConfig.smart.model, 500, 300),
        },
      });

      session.status = "completed";
      session.lastUpdate = result;
      this.emitStatus(sessionId, `Completed: ${result.slice(0, 200)}`);

      return { text: result, metadata: { sessionId } };
    } catch (err) {
      console.error(`[orchestrator] Coding agent error:`, err);
      session.status = "failed";
      session.lastUpdate = `Error: ${err instanceof Error ? err.message : "Unknown error"}`;
      this.emitStatus(sessionId, session.lastUpdate);
      throw err;
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
    const preferencesManager = this.getPreferencesManager(userId);

    // Load user preferences
    const prefs = preferencesManager.getAll();

    // Build preferences section for system prompt
    let preferencesSection = "\n## User Preferences\n";
    preferencesSection += `- Response tone: ${prefs.tone || "detailed"}\n`;
    preferencesSection += `- Verbosity level: ${prefs.verbosity || "normal"}\n`;

    if (prefs.behavioralRules && prefs.behavioralRules.length > 0) {
      preferencesSection += "\nBehavioral rules:\n";
      for (const rule of prefs.behavioralRules) {
        preferencesSection += `- ${rule}\n`;
      }
    }

    // Build system prompt with context and preferences
    let smartSystemPrompt = modeConfig.systemPrompt;
    smartSystemPrompt += preferencesSection;

    if (contextSummary) {
      smartSystemPrompt += `\n## Recent conversation context:\n${contextSummary}`;
    }

    try {
      console.log(`[orchestrator] Creating smart session with model: ${modeConfig.smart.model}`);

      // Create core tools for this session
      const cwd = modeConfig.cwd || process.cwd();
      const coreTools = createCoreTools(cwd);

      // Create config tools for preference access
      const configTools = createConfigTools(preferencesManager);

      // Merge all tools
      const tools = [...coreTools, ...configTools];

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
      const currentConfig = this.getCurrentModeConfig();
      const modes = this.getAvailableModes();
      let response = `Active mode: ${this.activeMode}\nAvailable modes: ${modes.join(", ")}`;

      if (currentConfig) {
        response += `\n\nCurrent mode details:\n- Integrations: ${currentConfig.integrations.join(", ")}\n- Tone: ${currentConfig.tone || "default"}`;
      }

      return { text: response };
    }

    if (trimmed.startsWith("/mode ")) {
      const newMode = trimmed.slice(6).trim();
      const result = this.switchMode(newMode);
      return { text: result.message };
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
