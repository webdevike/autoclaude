import type { Channel, Message } from "@jarvis/core";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
  };
}

interface TelegramResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
}

/**
 * Telegram channel using manual short-polling via fetch.
 * grammY's long polling hangs in some environments, so we
 * roll our own with a simple setInterval loop.
 */
export class TelegramChannel implements Channel {
  name = "telegram";
  private token: string;
  private allowedUsers: Set<string> = new Set();
  private running = false;
  private offset = 0;
  private pollInterval = 2000;

  constructor(token: string, allowedUsers?: string[]) {
    this.token = token;
    if (allowedUsers?.length) {
      this.allowedUsers = new Set(allowedUsers);
    }
  }

  private async api<T>(
    method: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `https://api.telegram.org/bot${this.token}/${method}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json()) as TelegramResponse<T>;
    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description ?? "unknown"}`);
    }
    return data.result;
  }

  async initialize(
    _config: Record<string, unknown>,
    onMessage: (msg: Message) => Promise<void>,
  ): Promise<void> {
    // Verify token — if this fails, we disable gracefully
    let me: { username: string };
    try {
      me = await this.api<{ username: string }>("getMe");
    } catch (err) {
      console.error(
        `[telegram] Cannot reach Telegram API: ${err instanceof Error ? err.message : err}`,
      );
      console.warn("[telegram] Bot disabled — will retry on next restart.");
      return;
    }
    console.log(`[telegram] Bot @${me.username} connected.`);

    // Drop pending updates by getting the latest and setting offset past it
    const pending = await this.api<TelegramUpdate[]>("getUpdates", {
      offset: -1,
      limit: 1,
    });
    if (pending.length > 0) {
      this.offset = pending[pending.length - 1].update_id + 1;
      console.log(`[telegram] Dropped pending updates, offset=${this.offset}`);
    }

    // Start polling
    this.running = true;
    this.poll(onMessage);
    console.log("[telegram] Polling started.");
  }

  private poll(onMessage: (msg: Message) => Promise<void>): void {
    const tick = async (): Promise<void> => {
      if (!this.running) return;

      try {
        const updates = await this.api<TelegramUpdate[]>("getUpdates", {
          offset: this.offset,
          limit: 20,
          timeout: 5,
        });

        for (const update of updates) {
          this.offset = update.update_id + 1;

          if (!update.message?.text) continue;

          const from = update.message.from;
          const sender =
            from?.username ?? String(from?.id ?? "unknown");
          const chatId = String(update.message.chat.id);

          // Track chat ID for replies
          chatIdMap.set(sender, chatId);

          // Auth check
          if (
            this.allowedUsers.size > 0 &&
            !this.allowedUsers.has(sender)
          ) {
            await this.api("sendMessage", {
              chat_id: update.message.chat.id,
              text: "Not authorized.",
            });
            continue;
          }

          const message: Message = {
            id: String(update.message.message_id),
            channel: "telegram",
            channelMessageId: chatId,
            sender,
            text: update.message.text,
            timestamp: update.message.date * 1000,
            mode: "",
            metadata: { chatId },
          };

          console.log(
            `[telegram] ${sender}: ${update.message.text.slice(0, 100)}`,
          );
          await onMessage(message);
        }
      } catch (err) {
        console.error(
          "[telegram] Poll error:",
          err instanceof Error ? err.message : err,
        );
      }

      if (this.running) {
        setTimeout(tick, this.pollInterval);
      }
    };

    tick();
  }

  async send(recipient: string, text: string): Promise<void> {
    const chatId = chatIdMap.get(recipient);
    if (!chatId) {
      console.error(
        `[telegram] No chat ID for recipient: ${recipient}`,
      );
      return;
    }

    const chunks = splitMessage(text, 4096);
    for (const chunk of chunks) {
      await this.api("sendMessage", {
        chat_id: Number(chatId),
        text: chunk,
      });
    }
  }

  async shutdown(): Promise<void> {
    this.running = false;
    console.log("[telegram] Bot stopped.");
  }
}

// In-memory map of username/id -> chatId
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
