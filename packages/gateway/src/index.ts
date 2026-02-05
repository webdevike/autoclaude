import type {
  AgentOrchestrator,
  Channel,
  Message,
  ModeConfig,
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

    try {
      const response = await this.orchestrator.handleMessage(message);
      await channel.send(message.sender, response.text);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Unknown error";
      console.error(`[gateway] Error processing message: ${errorMsg}`);
      await channel.send(
        message.sender,
        `Something went wrong: ${errorMsg}`,
      );
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

  /** Shutdown all channels */
  async shutdown(): Promise<void> {
    const shutdownPromises = Array.from(this.channels.values()).map((c) =>
      c.shutdown(),
    );
    await Promise.all(shutdownPromises);
    console.log("[gateway] Shutdown complete.");
  }
}
