import { App } from "@slack/bolt";
import type { Channel, Message } from "@jarvis/core";

export class SlackChannel implements Channel {
  name = "slack";
  private app: App | null = null;

  constructor(
    private botToken: string,
    private appToken: string,
    private signingSecret: string,
  ) {}

  async initialize(
    _config: Record<string, unknown>,
    onMessage: (msg: Message) => Promise<void>,
  ): Promise<void> {
    this.app = new App({
      token: this.botToken,
      appToken: this.appToken,
      signingSecret: this.signingSecret,
      socketMode: true,
    });

    // Listen for direct messages and mentions
    this.app.message(async ({ message, say }) => {
      if (message.subtype) return; // Ignore system messages
      if (!("text" in message) || !message.text) return;

      const sender = message.user ?? "unknown";
      const channelId = message.channel;

      const msg: Message = {
        id: message.ts ?? String(Date.now()),
        channel: "slack",
        channelMessageId: channelId,
        sender,
        text: message.text,
        timestamp: message.ts ? parseFloat(message.ts) * 1000 : Date.now(),
        mode: "", // Gateway will assign
        metadata: { channelId, threadTs: ("thread_ts" in message) ? message.thread_ts : undefined },
      };

      // Track channel for replies
      channelMap.set(sender, channelId);

      await onMessage(msg);
    });

    this.app.event("app_mention", async ({ event, say }) => {
      const sender = event.user ?? "unknown";
      const channelId = event.channel;
      // Strip the bot mention from the text
      const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

      const msg: Message = {
        id: event.ts,
        channel: "slack",
        channelMessageId: channelId,
        sender,
        text,
        timestamp: parseFloat(event.ts) * 1000,
        mode: "",
        metadata: { channelId, threadTs: event.thread_ts },
      };

      channelMap.set(sender, channelId);
      await onMessage(msg);
    });

    await this.app.start();
    console.log("[slack] Bot started in socket mode.");
  }

  async send(recipient: string, text: string): Promise<void> {
    if (!this.app) return;

    const channelId = channelMap.get(recipient);
    if (!channelId) {
      console.error(`[slack] No channel for recipient: ${recipient}`);
      return;
    }

    await this.app.client.chat.postMessage({
      channel: channelId,
      text,
    });
  }

  async shutdown(): Promise<void> {
    if (this.app) {
      await this.app.stop();
      console.log("[slack] Bot stopped.");
    }
  }
}

const channelMap = new Map<string, string>();
