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
      const modeConfig = this.config.modes.find((m) =>
        m.channels.includes(name),
      );
      const mode = modeConfig?.mode ?? this.config.defaultMode;

      startPromises.push(
        channel.initialize({}, async (msg: Message) => {
          await this.handleIncoming(msg, channel, mode);
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
    defaultMode: string,
  ): Promise<void> {
    // Assign mode based on channel or use message's mode
    const message: Message = {
      ...msg,
      id: msg.id || randomUUID(),
      mode: msg.mode || defaultMode,
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
      await this.handleAutoCommand(message, channel, defaultMode);
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
              const statusText = accumulated
                ? `${accumulated}\n\n_Using tool: ${event.toolName}..._`
                : `Using tool: ${event.toolName}...`;
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
  private async handleAutoCommand(msg: Message, channel: Channel, defaultMode: string): Promise<void> {
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
    const modeConfig = this.config.modes.find(m => m.mode === (msg.mode || defaultMode)) ?? this.config.modes[0];
    const taskCwd = cwd ?? modeConfig?.cwd ?? process.cwd();
    const chatId = (msg.metadata?.chatId as string) ?? msg.channelMessageId ?? msg.sender;

    const result = runner.startTask({
      description,
      sender: msg.sender,
      chatId,
      channelName: channel.name,
      mode: msg.mode || defaultMode,
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
