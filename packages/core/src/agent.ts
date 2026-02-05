import { randomUUID } from "node:crypto";
import { LLMClient } from "./llm.js";
import { TmuxManager } from "./tmux.js";
import type {
  AgentResponse,
  AgentSession,
  DelegationRequest,
  Message,
  ModeConfig,
  ModelTier,
  StatusUpdate,
  ToolDefinition,
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

export class AgentOrchestrator {
  private llm: LLMClient;
  private tmux: TmuxManager;
  private sessions: Map<string, AgentSession> = new Map();
  private tools: Map<string, ToolDefinition> = new Map();
  private modes: Map<string, ModeConfig> = new Map();
  private activeMode: string = "personal";
  private onStatusUpdate?: (update: StatusUpdate) => void;

  constructor(
    llm: LLMClient,
    tmux: TmuxManager,
  ) {
    this.llm = llm;
    this.tmux = tmux;
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

  /** Main entry point: process an incoming message */
  async handleMessage(msg: Message): Promise<AgentResponse> {
    const modeConfig = this.modes.get(msg.mode ?? this.activeMode);
    if (!modeConfig) {
      return { text: `Unknown mode: ${msg.mode}. Available: ${Array.from(this.modes.keys()).join(", ")}` };
    }

    // Check for built-in commands
    const cmdResponse = this.handleCommand(msg.text);
    if (cmdResponse) {
      return cmdResponse;
    }

    // Triage: ask the cheap model whether to handle or delegate
    const triageResponse = await this.llm.chat({
      model: modeConfig.triage,
      systemPrompt: DELEGATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: msg.text }],
    });

    const text = triageResponse.text.trim();

    if (text.startsWith("DELEGATE:")) {
      const taskDescription = text.slice("DELEGATE:".length).trim();
      return this.delegateToSmart(taskDescription, modeConfig);
    }

    // Triage handled it directly
    return { text };
  }

  /** Delegate work to a smart agent running in a tmux window */
  private async delegateToSmart(
    task: string,
    modeConfig: ModeConfig,
  ): Promise<AgentResponse> {
    const sessionId = randomUUID().slice(0, 8);
    const windowName = `smart-${sessionId}`;

    const session: AgentSession = {
      id: sessionId,
      tier: "smart",
      mode: modeConfig.mode,
      tmuxWindow: windowName,
      startedAt: Date.now(),
      status: "running",
    };

    this.sessions.set(sessionId, session);
    this.tmux.ensureSession();

    // Run the smart agent as an async task
    this.runSmartAgent(sessionId, task, modeConfig).catch((err) => {
      session.status = "failed";
      session.lastUpdate = `Error: ${err instanceof Error ? err.message : String(err)}`;
    });

    return {
      text: `Delegated to smart agent [${sessionId}]. You can peek with: /peek ${sessionId}\n\nTask: ${task}`,
      metadata: { sessionId, windowName },
    };
  }

  /** Execute the smart agent loop */
  private async runSmartAgent(
    sessionId: string,
    task: string,
    modeConfig: ModeConfig,
  ): Promise<void> {
    const session = this.sessions.get(sessionId)!;
    const availableTools = this.getTools();
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "user", content: task },
    ];

    const maxTurns = 20;
    let turn = 0;

    while (turn < maxTurns && session.status === "running") {
      turn++;

      const response = await this.llm.chat({
        model: modeConfig.smart,
        systemPrompt: modeConfig.systemPrompt,
        messages,
        tools: availableTools,
        maxTokens: modeConfig.smart.maxTokens,
      });

      // Execute any tool calls
      if (response.toolCalls?.length) {
        for (const call of response.toolCalls) {
          const tool = this.tools.get(call.name);
          if (tool) {
            const result = await tool.execute(call.params);
            messages.push({
              role: "assistant",
              content: `[Tool: ${call.name}] ${JSON.stringify(call.params)}`,
            });
            messages.push({ role: "user", content: `[Tool result]: ${result}` });

            // Update session status
            session.lastUpdate = `Used tool: ${call.name}`;
            this.emitStatus(sessionId, `Tool: ${call.name}`);
          }
        }
      } else {
        // No tool calls — agent is done
        messages.push({ role: "assistant", content: response.text });
        session.status = "completed";
        session.lastUpdate = response.text;
        this.emitStatus(sessionId, `Completed: ${response.text.slice(0, 200)}`);
        break;
      }
    }

    if (turn >= maxTurns) {
      session.status = "completed";
      session.lastUpdate = "Reached maximum turns";
      this.emitStatus(sessionId, "Reached maximum turns");
    }
  }

  /** Handle built-in slash commands */
  private handleCommand(text: string): AgentResponse | null {
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
      if (!session?.tmuxWindow) {
        return { text: `Session ${sessionId} not found or has no tmux window.` };
      }
      const output = this.tmux.peek(session.tmuxWindow);
      return { text: `--- ${session.tmuxWindow} ---\n${output}` };
    }

    if (trimmed === "/peek") {
      const windows = this.tmux.listWindows();
      if (windows.length === 0) {
        return { text: "No active tmux windows." };
      }
      return { text: `Active windows:\n${windows.join("\n")}` };
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
