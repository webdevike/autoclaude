import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import {
  createPiSession,
  createAuthStorage,
  promptWithStreaming,
} from "./pi-session.js";
import { createCoreTools } from "./tools/core-tools.js";
import { createConfigTools } from "./tools/config-tools.js";
import { createAutonomyTools } from "./tools/autonomy-tools.js";
import { runClaudeCode } from "./claude-code-delegate.js";
import { PreferencesManager } from "./preferences.js";
import { ConfigManager } from "./config-manager.js";
import { createJarvisMcpServer, getJarvisToolNames, MCP_SERVER_NAME } from "./sdk-mcp-bridge.js";
import type {
  AgentResponse,
  AgentSession,
  Integration,
  Message,
  ModeConfig,
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
  private configManager: ConfigManager;

  // Pi session components (shared across all calls)
  private authStorage = createAuthStorage();

  // Claude Code session IDs per user (for conversation continuity)
  private claudeCodeSessions: Map<string, string> = new Map();

  // Integrations for MCP bridge (set by CLI)
  private integrations: Integration[] = [];

  // Cached skill docs from .pi/skills/*/SKILL.md (loaded once)
  private skillDocsCache: string | null = null;

  // Callbacks for live cron job management (set by CLI after scheduler is created)
  private cronCallbacks?: {
    onAdded: (config: import("./types.js").CronJobConfig) => void;
    onRemoved: (name: string) => void;
  };

  constructor(configDir?: string) {
    this.configDir = configDir || resolve(process.cwd(), "config");
    this.configManager = new ConfigManager(this.configDir);
  }

  /** Set callbacks for live cron job management (called by CLI after scheduler is ready) */
  setCronCallbacks(callbacks: {
    onAdded: (config: import("./types.js").CronJobConfig) => void;
    onRemoved: (name: string) => void;
  }): void {
    this.cronCallbacks = callbacks;
  }

  /** Get cron callbacks (used by autonomy tools) */
  getCronCallbacks() {
    return this.cronCallbacks;
  }

  /** Set initialized integrations for MCP bridge (called by CLI) */
  setIntegrations(integrations: Integration[]): void {
    this.integrations = integrations;
    console.log(`[orchestrator] Registered ${integrations.length} integrations for MCP bridge`);
  }

  /** Load .pi/skills SKILL.md files and cache as a combined string */
  private getSkillDocs(): string {
    if (this.skillDocsCache !== null) return this.skillDocsCache;

    const skillsDir = resolve(process.cwd(), ".pi", "skills");
    if (!existsSync(skillsDir)) {
      this.skillDocsCache = "";
      return "";
    }

    const parts: string[] = [];
    try {
      const dirs = readdirSync(skillsDir);
      for (const dir of dirs) {
        const skillPath = resolve(skillsDir, dir, "SKILL.md");
        if (existsSync(skillPath)) {
          const content = readFileSync(skillPath, "utf-8");
          parts.push(content);
        }
      }
    } catch (err) {
      console.warn("[orchestrator] Failed to load skill docs:", err instanceof Error ? err.message : err);
    }

    this.skillDocsCache = parts.length
      ? "\n\n## Available Integrations & Skills\n\nYou have access to these integrations via Bash (curl). Use them when the user's request involves these services.\n\n" + parts.join("\n\n---\n\n")
      : "";

    if (this.skillDocsCache) {
      console.log(`[orchestrator] Loaded ${parts.length} skill doc(s) from .pi/skills/`);
    }

    return this.skillDocsCache;
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

    // Primary path: Claude Code SDK (handles all messages)
    try {
      return await this.delegateToClaudeCode(msg, modeConfig, onProgress);
    } catch (err) {
      console.warn(
        `[orchestrator] Claude Code failed, falling back to pi-ai:`,
        err instanceof Error ? err.message : err,
      );
    }

    // Fallback: Pi-AI smart agent
    onProgress?.({ type: "status", text: "Falling back to smart agent..." });

    const history = sessionManager.loadSession(50);
    const contextSummary = history
      .slice(-10)
      .map(entry => `${entry.role}: ${entry.content.slice(0, 200)}`)
      .join("\n");

    return this.delegateToSmart(msg.text, modeConfig, msg.sender, contextSummary, onProgress);
  }

  /** Fallback: delegate work to a smart agent using Pi SDK */
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

      // Create autonomy tools for self-configuration
      const autonomyTools = createAutonomyTools(this.configManager, preferencesManager, this.cronCallbacks);

      // Merge all tools
      const tools = [...coreTools, ...configTools, ...autonomyTools];

      const { session: piSession } = await createPiSession({
        modelString: modeConfig.smart.model,
        systemPrompt: smartSystemPrompt,
        maxTokens: modeConfig.smart.maxTokens,
        authStorage: this.authStorage,
        tools,
        cwd,
        currentMode: modeConfig.mode,
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

  /** Primary: delegate to Claude Code SDK with session continuity */
  private async delegateToClaudeCode(
    msg: Message,
    modeConfig: ModeConfig,
    onProgress?: (event: StreamProgressEvent) => void,
  ): Promise<AgentResponse> {
    const sessionManager = this.getSessionManager(msg.sender);

    // Log user message
    sessionManager.appendSession({
      timestamp: Date.now(),
      role: "user",
      content: msg.text,
    });

    onProgress?.({ type: "status", text: "Thinking..." });

    const cwd = modeConfig.cwd || process.cwd();
    const existingSessionId = this.claudeCodeSessions.get(msg.sender);

    // Build system prompt with skill docs so Claude knows about integrations
    const systemPrompt = modeConfig.systemPrompt + this.getSkillDocs();

    // Build MCP server with integration + autonomy tools
    const preferencesManager = this.getPreferencesManager(msg.sender);
    const mcpServer = this.integrations.length > 0 || this.cronCallbacks
      ? createJarvisMcpServer({
          integrations: this.integrations,
          configManager: this.configManager,
          preferencesManager,
          cronCallbacks: this.cronCallbacks,
          currentMode: modeConfig.mode,
        })
      : undefined;

    // Auto-allow all MCP tool names
    const baseAllowed = modeConfig.claudeCode?.allowedTools ?? [];
    const mcpToolNames = mcpServer
      ? getJarvisToolNames(
          this.integrations,
          !!process.env.EXA_API_KEY,
          !!preferencesManager,
        )
      : [];
    const allowedTools = [...baseAllowed, ...mcpToolNames];

    // If tools whitelist is set, merge MCP tool names so they're visible
    const configTools = modeConfig.claudeCode?.tools;
    const tools = configTools && mcpToolNames.length > 0
      ? [...configTools, ...mcpToolNames]
      : configTools;

    const mcpServers = mcpServer
      ? { [MCP_SERVER_NAME]: mcpServer }
      : undefined;

    try {
      const result = await runClaudeCode({
        prompt: msg.text,
        systemPrompt,
        sessionId: existingSessionId,
        allowedTools,
        tools,
        permissionMode: modeConfig.claudeCode?.permissionMode,
        maxTurns: modeConfig.claudeCode?.maxTurns,
        cwd,
        mcpServers,
        onProgress,
      });

      // Store session ID for continuity
      if (result.sessionId) {
        this.claudeCodeSessions.set(msg.sender, result.sessionId);
        console.log(
          `[orchestrator] Claude Code session for ${msg.sender}: ${result.sessionId}`,
        );
      }

      const finalText =
        result.text?.trim() ||
        "I processed your request but have no response to show.";

      sessionManager.appendSession({
        timestamp: Date.now(),
        role: "assistant",
        content: finalText,
      });

      return { text: finalText };
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Unknown error";
      console.error(`[orchestrator] Claude Code error:`, errorMsg);

      // If resume failed, try without session (fresh conversation)
      if (existingSessionId) {
        console.log(
          `[orchestrator] Retrying without session resume for ${msg.sender}`,
        );
        this.claudeCodeSessions.delete(msg.sender);

        try {
          const result = await runClaudeCode({
            prompt: msg.text,
            systemPrompt,
            allowedTools,
            tools,
            permissionMode: modeConfig.claudeCode?.permissionMode,
            maxTurns: modeConfig.claudeCode?.maxTurns,
            cwd,
            mcpServers,
            onProgress,
          });

          if (result.sessionId) {
            this.claudeCodeSessions.set(msg.sender, result.sessionId);
          }

          const finalText =
            result.text?.trim() ||
            "I processed your request but have no response to show.";

          sessionManager.appendSession({
            timestamp: Date.now(),
            role: "assistant",
            content: finalText,
          });

          return { text: finalText };
        } catch (retryErr) {
          const retryMsg =
            retryErr instanceof Error ? retryErr.message : "Unknown error";
          throw new Error(`Claude Code failed: ${retryMsg}`);
        }
      }

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
