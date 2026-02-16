import type {
  AgentOrchestrator,
  Channel,
  InlineKeyboardMarkup,
  Message,
  ModeConfig,
  StreamProgressEvent,
} from "@jarvis/core";
import { randomUUID } from "node:crypto";

export interface GatewayConfig {
  modes: ModeConfig[];
  defaultMode: string;
}

/**
 * The Gateway routes incoming messages from channels to the agent orchestrator,
 * manages mode context, and routes responses back to the originating channel.
 */
export class Gateway {
  private channels: Map<string, Channel> = new Map();
  private orchestrator: AgentOrchestrator;
  private config: GatewayConfig;

  constructor(orchestrator: AgentOrchestrator, config: GatewayConfig) {
    this.orchestrator = orchestrator;
    this.config = config;

    // Register all modes with the orchestrator
    for (const mode of config.modes) {
      orchestrator.registerMode(mode);
    }

    // Set default mode
    orchestrator.switchMode(config.defaultMode);
  }

  /** Register a channel adapter */
  registerChannel(channel: Channel): void {
    this.channels.set(channel.name, channel);
  }

  /** Get a channel by name */
  getChannel(name: string): Channel | undefined {
    return this.channels.get(name);
  }

  /** Send a message with inline keyboard via a channel */
  async sendWithKeyboard(channelName: string, recipient: string, text: string, keyboard: InlineKeyboardMarkup): Promise<string | undefined> {
    const channel = this.channels.get(channelName);
    if (!channel?.sendWithKeyboard) return undefined;
    return channel.sendWithKeyboard(recipient, text, keyboard);
  }

  /** Edit a message to remove its inline keyboard */
  async editMessageRemoveKeyboard(channelName: string, recipient: string, messageId: string, text: string): Promise<void> {
    const channel = this.channels.get(channelName) as Channel & { editMessageRemoveKeyboard?: (r: string, m: string, t: string) => Promise<void> };
    if (channel?.editMessageRemoveKeyboard) {
      await channel.editMessageRemoveKeyboard(recipient, messageId, text);
    }
  }

  /** Initialize all registered channels and start listening */
  async start(): Promise<void> {
    const startPromises: Promise<void>[] = [];

    for (const [name, channel] of this.channels) {
      // Find the mode that exclusively owns this channel (mode-specific channel name like "telegram-work")
      const exclusiveMode = this.config.modes.find((m) =>
        m.channels.includes(name) && name !== "telegram",
      );

      // If a channel is mode-specific (e.g. "telegram-personal"), lock it to that mode.
      // Otherwise (shared "telegram" channel), pass empty string so the orchestrator
      // uses its activeMode — this makes /mode switching work correctly.
      const fixedMode = exclusiveMode?.mode ?? "";

      startPromises.push(
        channel.initialize({}, async (msg: Message) => {
          await this.handleIncoming(msg, channel, fixedMode);
        }),
      );
    }

    await Promise.all(startPromises);
    console.log(
      `[gateway] Started with channels: ${Array.from(this.channels.keys()).join(", ")}`,
    );
  }

  /** Handle an incoming message from any channel */
  private async handleIncoming(
    msg: Message,
    channel: Channel,
    fixedMode: string,
  ): Promise<void> {
    // Assign mode: use fixed mode for mode-specific channels,
    // otherwise leave empty so orchestrator uses its activeMode (supports /mode switching)
    const message: Message = {
      ...msg,
      id: msg.id || randomUUID(),
      mode: msg.mode || fixedMode,
      timestamp: msg.timestamp || Date.now(),
    };

    console.log(
      `[gateway] ${channel.name}/${message.sender}: ${message.text.slice(0, 100)}`,
    );

    // --- Autonomous runner interception ---
    const runner = this.orchestrator.getAutonomousRunner?.();

    // Check if runner has a pending question for this sender
    if (runner?.hasPendingQuestion(message.sender)) {
      const handled = runner.handleUserReply(message.sender, message.text);
      if (handled) {
        console.log(`[gateway] Routed reply to autonomous runner for ${message.sender}`);
        return;
      }
    }

    // Handle /auto commands
    if (message.text.startsWith("/auto")) {
      await this.handleAutoCommand(message, channel, fixedMode);
      return;
    }

    let placeholderId: string | undefined;
    try {
      placeholderId = await channel.sendPlaceholder?.(
        message.sender,
        "Contemplating...",
      );
    } catch (err) {
      console.warn(
        `[gateway] Failed to send placeholder: ${err instanceof Error ? err.message : err}`,
      );
    }

    // Throttled message editing for streaming
    const EDIT_THROTTLE_MS = 1000; // Telegram rate limit: 1 edit/second
    let accumulated = "";
    let lastEditTime = 0;
    let editTimer: ReturnType<typeof setTimeout> | null = null;
    let inStatusPhase = true; // Track if we're showing status messages (no streaming)

    // Helper to perform a throttled edit
    const doEdit = (text: string) => {
      if (!placeholderId || !channel.editMessage) return;

      const now = Date.now();
      if (now - lastEditTime >= EDIT_THROTTLE_MS) {
        // Enough time passed, edit immediately
        lastEditTime = now;
        channel
          .editMessage(message.sender, placeholderId, text)
          .catch(() => {});
      } else if (!editTimer) {
        // Schedule an edit for when throttle period expires
        const remaining = EDIT_THROTTLE_MS - (now - lastEditTime);
        editTimer = setTimeout(() => {
          lastEditTime = Date.now();
          editTimer = null;
          if (placeholderId && channel.editMessage) {
            channel
              .editMessage(message.sender, placeholderId, text)
              .catch(() => {});
          }
        }, remaining);
      }
    };

    // onProgress callback - supports both StreamProgressEvent and legacy string format
    const onProgress =
      placeholderId && channel.editMessage
        ? (statusOrEvent: string | StreamProgressEvent) => {
            // Handle backwards compatibility with string-based status
            if (typeof statusOrEvent === "string") {
              const event: StreamProgressEvent = {
                type: "status",
                text: statusOrEvent,
              };
              statusOrEvent = event;
            }

            const event = statusOrEvent as StreamProgressEvent;

            if (event.type === "text_delta" && event.delta) {
              // Exit status phase when we start receiving actual text
              if (inStatusPhase) {
                inStatusPhase = false;
                accumulated = ""; // Reset accumulated text for clean start
              }
              accumulated += event.delta;
              doEdit(accumulated);
            } else if (event.type === "tool_use" && event.toolName) {
              // Tool usage exits status phase
              inStatusPhase = false;
              const friendly = formatToolName(event.toolName);
              const statusText = accumulated
                ? `${accumulated}\n\n_${friendly}_`
                : friendly;
              doEdit(statusText);
            } else if (event.type === "status" && event.text) {
              // Status updates keep us in status phase - just show the status text
              // Don't accumulate or mix with streaming text
              inStatusPhase = true;
              doEdit(event.text);
            } else if (event.type === "done" && event.finalText) {
              // Final update with complete text
              inStatusPhase = false;
              accumulated = event.finalText;
            }
          }
        : undefined;

    try {
      const response = await this.orchestrator.handleMessage(
        message,
        onProgress,
      );

      // Clear any pending edit timer
      if (editTimer) {
        clearTimeout(editTimer);
        editTimer = null;
      }

      // Final message: delete the streaming placeholder and send a properly formatted message
      const finalText =
        response.text?.trim() ||
        "I processed your request but have no response to show.";

      if (placeholderId && channel.deleteMessage) {
        await channel.deleteMessage(message.sender, placeholderId).catch(() => {});
      }
      await channel.send(message.sender, finalText);
    } catch (err) {
      // Clear any pending edit timer on error
      if (editTimer) {
        clearTimeout(editTimer);
        editTimer = null;
      }

      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[gateway] Error processing message: ${errorMsg}`);
      await channel.send(message.sender, `Something went wrong: ${errorMsg}`);
    }
  }


  /** Handle /auto commands */
  private async handleAutoCommand(msg: Message, channel: Channel, fixedMode: string): Promise<void> {
    const runner = this.orchestrator.getAutonomousRunner?.();
    if (!runner) {
      await channel.send(msg.sender, "Autonomous runner not available.");
      return;
    }

    const args = msg.text.slice(5).trim(); // strip "/auto"

    if (!args || args === "help") {
      await channel.send(msg.sender, "Usage:\n/auto <task description> — start a task\n/auto status — check running task\n/auto cancel — cancel running task");
      return;
    }

    if (args === "status") {
      await channel.send(msg.sender, runner.getStatus());
      return;
    }

    if (args === "cancel") {
      await channel.send(msg.sender, runner.cancel());
      return;
    }

    // Parse optional --cwd flag
    let cwd: string | undefined;
    let description = args;
    const cwdMatch = args.match(/^--cwd\s+(\S+)\s+([\s\S]+)$/);
    if (cwdMatch) {
      cwd = cwdMatch[1];
      description = cwdMatch[2];
    }

    // Get mode config for cwd fallback
    const modeConfig = this.config.modes.find(m => m.mode === (msg.mode || fixedMode || this.config.defaultMode)) ?? this.config.modes[0];
    const taskCwd = cwd ?? modeConfig?.cwd ?? process.cwd();
    const chatId = (msg.metadata?.chatId as string) ?? msg.channelMessageId ?? msg.sender;

    const result = runner.startTask({
      description,
      sender: msg.sender,
      chatId,
      channelName: channel.name,
      mode: msg.mode || fixedMode || this.config.defaultMode,
      cwd: taskCwd,
    });

    if ("error" in result) {
      await channel.send(msg.sender, result.error);
    } else {
      await channel.send(msg.sender, `Task ${result.taskId} started. Planning...`);
    }
  }

  /** Broadcast a message to all channels for a given mode */
  async broadcast(mode: string, text: string): Promise<void> {
    const modeConfig = this.config.modes.find((m) => m.mode === mode);
    if (!modeConfig) return;

    for (const channelName of modeConfig.channels) {
      const channel = this.channels.get(channelName);
      if (channel) {
        // Broadcast to a general channel — channels handle routing
        await channel.send("broadcast", text);
      }
    }
  }

  /** Send a message to a specific channel/recipient (used for cron replies) */
  async sendToChannel(channelName: string, recipient: string, text: string): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      console.warn(`[gateway] Channel '${channelName}' not found for cron reply`);
      return;
    }
    await channel.send(recipient, text);
  }

  /** Shutdown all channels */
  async shutdown(): Promise<void> {
    const shutdownPromises = Array.from(this.channels.values()).map((c) =>
      c.shutdown(),
    );
    await Promise.all(shutdownPromises);
    console.log("[gateway] Shutdown complete.");
  }
}

/**
 * Convert raw MCP/SDK tool names into clean, user-friendly labels.
 *
 * Examples:
 *   mcp__notion__notion-search       → "Searching Notion..."
 *   mcp__jarvis-tools__exa_search    → "Searching the web..."
 *   mcp__jarvis-tools__gmail_send    → "Sending email..."
 *   Read                             → "Reading file..."
 *   Bash                             → "Running command..."
 */
function formatToolName(raw: string): string {
  // --- Notion MCP tools ---
  if (raw.startsWith("mcp__notion__")) {
    const tool = raw.replace("mcp__notion__", "").replace("notion-", "");
    const notionMap: Record<string, string> = {
      "search": "Searching Notion...",
      "fetch": "Reading Notion page...",
      "create-pages": "Creating Notion page...",
      "update-page": "Updating Notion page...",
      "move-pages": "Moving Notion pages...",
      "duplicate-page": "Duplicating Notion page...",
      "create-database": "Creating Notion database...",
      "update-data-source": "Updating Notion data source...",
      "query-data-sources": "Querying Notion data...",
      "query-database-view": "Querying Notion database...",
      "create-comment": "Adding Notion comment...",
      "get-comments": "Reading Notion comments...",
      "get-teams": "Fetching Notion teams...",
      "get-users": "Fetching Notion users...",
      "get-user": "Fetching Notion user...",
      "get-self": "Checking Notion identity...",
    };
    return notionMap[tool] ?? `Using Notion...`;
  }

  // --- Jarvis MCP tools ---
  if (raw.startsWith("mcp__jarvis-tools__")) {
    const tool = raw.replace("mcp__jarvis-tools__", "");

    if (tool === "exa_search") return "Searching the web...";
    if (tool.startsWith("gmail_")) {
      const action = tool.replace("gmail_", "");
      const gmailMap: Record<string, string> = {
        "send": "Sending email...",
        "read": "Reading email...",
        "search": "Searching email...",
        "list": "Listing emails...",
        "draft": "Drafting email...",
      };
      return gmailMap[action] ?? "Using Gmail...";
    }
    if (tool.startsWith("linear_")) {
      const action = tool.replace("linear_", "");
      const linearMap: Record<string, string> = {
        "create_issue": "Creating Linear issue...",
        "update_issue": "Updating Linear issue...",
        "list_issues": "Listing Linear issues...",
        "search": "Searching Linear...",
      };
      return linearMap[action] ?? "Using Linear...";
    }
    if (tool === "add_cron_job") return "Setting up scheduled task...";
    if (tool === "remove_cron_job") return "Removing scheduled task...";
    if (tool === "list_cron_jobs") return "Listing scheduled tasks...";
    if (tool === "update_mode_config") return "Updating configuration...";
    if (tool === "get_preference") return "Reading preferences...";
    if (tool === "set_preference") return "Saving preferences...";

    // Generic jarvis tool fallback: clean up underscores
    return `Using ${tool.replace(/_/g, " ")}...`;
  }

  // --- Built-in Claude Code tools ---
  const builtinMap: Record<string, string> = {
    "Read": "Reading file...",
    "Write": "Writing file...",
    "Edit": "Editing file...",
    "MultiEdit": "Editing files...",
    "Bash": "Running command...",
    "Glob": "Searching files...",
    "Grep": "Searching code...",
    "WebSearch": "Searching the web...",
    "WebFetch": "Fetching webpage...",
    "Task": "Running sub-task...",
    "TodoRead": "Checking tasks...",
    "TodoWrite": "Updating tasks...",
    "NotebookEdit": "Editing notebook...",
  };
  if (builtinMap[raw]) return builtinMap[raw];

  // --- Generic MCP fallback (mcp__<server>__<tool>) ---
  const mcpMatch = raw.match(/^mcp__([^_]+)__(.+)$/);
  if (mcpMatch) {
    const server = mcpMatch[1].replace(/-/g, " ");
    const tool = mcpMatch[2].replace(/[_-]/g, " ");
    return `Using ${server}: ${tool}...`;
  }

  // Final fallback: clean up and return
  return `Using ${raw.replace(/[_-]/g, " ")}...`;
}

// HTTP API exports
export { startHttpApi } from "./http-api.js";
export type { HttpApiConfig } from "./http-api.js";
