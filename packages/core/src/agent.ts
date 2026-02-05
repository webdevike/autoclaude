import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { Agent } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { Model, Context, Api, Tool } from "@mariozechner/pi-ai";
import { createModel, completeLLM, streamLLM } from "./llm.js";
import type {
  AgentResponse,
  AgentSession,
  Message,
  ModeConfig,
  ModelTier,
  StatusUpdate,
  ToolDefinition,
  ToolDefinitionPiAi,
  SessionEntry,
  StreamProgressEvent,
} from "./types.js";

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
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "anthropic/claude-3.5-sonnet": { input: 3.0, output: 15.0 },
  "anthropic/claude-3.5-haiku": { input: 0.8, output: 4.0 },
  "openai/gpt-4o": { input: 2.5, output: 10.0 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || { input: 0, output: 0 };
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
    appendFileSync(filePath, newContent, "utf-8");
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

    // Load conversation history for context-aware triage
    const history = sessionManager.loadSession(50);
    const contextMessages = history.map(entry => ({
      role: entry.role === "user" ? "user" : "assistant",
      content: entry.content,
    }));

    // Triage: ask the cheap model whether to handle or delegate
    onProgress?.({ type: "status", text: "Triaging request..." });
    const toolNames = Array.from(this.tools.keys());
    const triagePrompt = toolNames.length
      ? `${DELEGATION_SYSTEM_PROMPT}\n\nAvailable tools: ${toolNames.join(", ")}\n\nIf the user's request could benefit from any of these tools, ALWAYS delegate.`
      : DELEGATION_SYSTEM_PROMPT;

    const triageModel = createModel(modeConfig.triage.model);
    const triageContext: Context = {
      systemPrompt: triagePrompt,
      messages: [
        ...contextMessages.slice(-10).map(m => ({
          role: m.role as "user",
          content: m.content,
          timestamp: Date.now(),
        })),
        { role: "user", content: msg.text, timestamp: Date.now() },
      ],
    };

    const triageResponse = await completeLLM(triageModel, triageContext);
    const textContent = triageResponse.content.filter(c => c.type === "text");
    const text = textContent.map(c => (c as any).text).join("");

    // Log token usage for triage
    const triageCost = calculateCost(
      modeConfig.triage.model,
      triageResponse.usage.input,
      triageResponse.usage.output
    );
    sessionManager.appendSession({
      timestamp: Date.now(),
      role: "assistant",
      content: text,
      usage: {
        inputTokens: triageResponse.usage.input,
        outputTokens: triageResponse.usage.output,
        model: modeConfig.triage.model,
        cost: triageCost,
      },
    });

    console.log(`[triage] ${modeConfig.triage.model}: ${triageResponse.usage.input} in / ${triageResponse.usage.output} out / $${triageCost.toFixed(4)}`);

    const delegateIdx = text.indexOf("DELEGATE:");

    if (delegateIdx !== -1) {
      const taskDescription = text.slice(delegateIdx + "DELEGATE:".length).trim();
      onProgress?.({ type: "status", text: "Delegating to smart agent..." });
      return this.delegateToSmart(taskDescription, modeConfig, msg.sender, onProgress);
    }

    // Triage handled it directly
    onProgress?.({ type: "done", finalText: text });
    return { text };
  }

  /** Delegate work to a smart agent using pi-agent-core */
  private async delegateToSmart(
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

    onProgress?.({ type: "status", text: `Working on: ${task.slice(0, 60)}...` });
    const result = await this.runSmartAgent(sessionId, task, modeConfig, userId, onProgress);
    return { text: result, metadata: { sessionId } };
  }

  /** Execute the smart agent using pi-agent-core */
  private async runSmartAgent(
    sessionId: string,
    task: string,
    modeConfig: ModeConfig,
    userId: string,
    onProgress?: (event: StreamProgressEvent) => void,
  ): Promise<string> {
    const session = this.sessions.get(sessionId)!;
    const sessionManager = this.getSessionManager(userId);
    const smartModel = createModel(modeConfig.smart.model);

    // Load conversation history
    const history = sessionManager.loadSession(50);
    const piMessages: any[] = history.slice(-10).map(entry => {
      if (entry.role === "user") {
        return {
          role: "user",
          content: entry.content,
          timestamp: entry.timestamp,
        };
      } else {
        // Convert assistant messages back to pi-ai format
        return {
          role: "assistant",
          content: [{ type: "text", text: entry.content }],
          api: smartModel.api,
          provider: smartModel.provider,
          model: smartModel.name,
          usage: entry.usage ? {
            input: entry.usage.inputTokens,
            output: entry.usage.outputTokens,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: entry.usage.inputTokens + entry.usage.outputTokens,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: entry.usage.cost },
          } : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop" as const,
          timestamp: entry.timestamp,
        };
      }
    });

    // Convert tools to pi-agent-core AgentTool format
    const agentTools = this.getTools().map(tool => {
      // Convert JSON schema to TypeBox
      const params = tool.parameters as any;
      let typeboxSchema;

      if (params.properties) {
        const properties: Record<string, any> = {};
        for (const [key, value] of Object.entries(params.properties as Record<string, any>)) {
          if (value.type === "string") {
            properties[key] = Type.String({ description: value.description });
          } else if (value.type === "number") {
            properties[key] = Type.Number({ description: value.description });
          } else if (value.type === "boolean") {
            properties[key] = Type.Boolean({ description: value.description });
          } else if (value.type === "array") {
            properties[key] = Type.Array(Type.Any(), { description: value.description });
          } else {
            properties[key] = Type.Any({ description: value.description });
          }
        }
        typeboxSchema = Type.Object(properties);
      } else {
        typeboxSchema = Type.Object({});
      }

      return {
        name: tool.name,
        label: tool.name,
        description: tool.description,
        parameters: typeboxSchema,
        execute: async (toolCallId: string, params: any) => {
          const result = await tool.execute(params);

          // Log tool usage
          sessionManager.appendSession({
            timestamp: Date.now(),
            role: "tool_result",
            content: result,
            toolName: tool.name,
          });

          session.lastUpdate = `Used tool: ${tool.name}`;
          this.emitStatus(sessionId, `Tool: ${tool.name}`);

          return {
            content: [{ type: "text" as const, text: result }],
            details: {},
          };
        },
      };
    });

    // Create pi-agent-core Agent
    const agent = new Agent({
      initialState: {
        systemPrompt: modeConfig.systemPrompt,
        model: smartModel,
        tools: agentTools,
        messages: piMessages,
        isStreaming: false,
        streamMessage: null,
        pendingToolCalls: new Set(),
        thinkingLevel: "off",
      },
    });

    let accumulatedText = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let isComplete = false;

    // Subscribe to agent events
    agent.subscribe((event) => {
      if (event.type === "message_update") {
        // Extract text from content
        const assistantMsg = event.message as any;
        if (assistantMsg.content) {
          const textParts = assistantMsg.content.filter((c: any) => c.type === "text");
          const newText = textParts.map((c: any) => c.text).join("");
          if (newText !== accumulatedText) {
            const delta = newText.slice(accumulatedText.length);
            accumulatedText = newText;
            onProgress?.({ type: "text_delta", text: accumulatedText, delta });
          }
        }

        // Track usage from assistant message event
        const evt = event.assistantMessageEvent;
        if (evt.type === "done" || evt.type === "error") {
          // Extract usage from the completed message
          if (assistantMsg.usage) {
            totalInputTokens += assistantMsg.usage.input || 0;
            totalOutputTokens += assistantMsg.usage.output || 0;
          }
        }
      } else if (event.type === "message_end") {
        // Also track usage when message completes
        const assistantMsg = event.message as any;
        if (assistantMsg.usage) {
          totalInputTokens += assistantMsg.usage.input || 0;
          totalOutputTokens += assistantMsg.usage.output || 0;
        }
      } else if (event.type === "tool_execution_start") {
        onProgress?.({ type: "tool_use", toolName: event.toolName });
      } else if (event.type === "agent_end") {
        isComplete = true;
      }
    });

    // Send the task as a prompt
    await agent.prompt(task);

    // Wait for agent to finish
    await agent.waitForIdle();

    // Extract final text from the last assistant message
    const messages = agent.state.messages;
    const lastAssistantMsg = [...messages].reverse().find(m => (m as any).role === "assistant");
    let finalText = accumulatedText;

    if (lastAssistantMsg && (lastAssistantMsg as any).content) {
      const textParts = (lastAssistantMsg as any).content.filter((c: any) => c.type === "text");
      finalText = textParts.map((c: any) => c.text).join("") || accumulatedText;
    }

    // Calculate and log cost
    const cost = calculateCost(modeConfig.smart.model, totalInputTokens, totalOutputTokens);
    console.log(`[smart] ${modeConfig.smart.model}: ${totalInputTokens} in / ${totalOutputTokens} out / $${cost.toFixed(4)}`);

    // Log final response with usage
    sessionManager.appendSession({
      timestamp: Date.now(),
      role: "assistant",
      content: finalText,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        model: modeConfig.smart.model,
        cost,
      },
    });

    session.status = "completed";
    session.lastUpdate = finalText;
    this.emitStatus(sessionId, `Completed: ${finalText.slice(0, 200)}`);

    onProgress?.({ type: "done", finalText });
    return finalText;
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
