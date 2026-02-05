import { Bot } from "grammy";
import type { Channel, Message } from "@jarvis/core";

export class TelegramChannel implements Channel {
  name = "telegram";
  private bot: Bot | null = null;
  private allowedUsers: Set<string> = new Set();

  constructor(
    private token: string,
    allowedUsers?: string[],
  ) {
    if (allowedUsers?.length) {
      this.allowedUsers = new Set(allowedUsers);
    }
  }

  async initialize(
    _config: Record<string, unknown>,
    onMessage: (msg: Message) => Promise<void>,
  ): Promise<void> {
    this.bot = new Bot(this.token);

    this.bot.on("message:text", async (ctx) => {
      const sender = ctx.from?.username ?? String(ctx.from?.id ?? "unknown");
      const chatId = String(ctx.chat.id);

      // If allowedUsers is set, only process messages from those users
      if (this.allowedUsers.size > 0 && !this.allowedUsers.has(sender)) {
        await ctx.reply("Not authorized.");
        return;
      }

      const message: Message = {
        id: String(ctx.message.message_id),
        channel: "telegram",
        channelMessageId: chatId,
        sender,
        text: ctx.message.text,
        timestamp: ctx.message.date * 1000,
        mode: "", // Gateway will assign mode
        metadata: { chatId },
      };

      await onMessage(message);
    });

    // Store chat IDs for sending messages back
    this.bot.on("message", async (ctx) => {
      const sender = ctx.from?.username ?? String(ctx.from?.id ?? "unknown");
      chatIdMap.set(sender, String(ctx.chat.id));
    });

    await this.bot.start();
    console.log("[telegram] Bot started.");
  }

  async send(recipient: string, text: string): Promise<void> {
    if (!this.bot) return;

    const chatId = chatIdMap.get(recipient);
    if (!chatId) {
      console.error(`[telegram] No chat ID for recipient: ${recipient}`);
      return;
    }

    // Split long messages (Telegram has a 4096 char limit)
    const chunks = splitMessage(text, 4096);
    for (const chunk of chunks) {
      await this.bot.api.sendMessage(Number(chatId), chunk);
    }
  }

  async shutdown(): Promise<void> {
    if (this.bot) {
      await this.bot.stop();
      console.log("[telegram] Bot stopped.");
    }
  }
}

// Simple in-memory map of username -> chatId
const chatIdMap = new Map<string, string>();

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, maxLen));
    remaining = remaining.slice(maxLen);
  }
  return chunks;
}
