import type { Channel, Message } from "@jarvis/core";
import telegramifyMarkdown from "telegramify-markdown";

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
  private processedUpdates = new Set<number>(); // Track processed update IDs to prevent duplicates

  constructor(token: string, allowedUsers?: string[]) {
    this.token = token;
    if (allowedUsers?.length) {
      this.allowedUsers = new Set(allowedUsers);
    }
  }

  private async api<T>(
    method: string,
    body?: Record<string, unknown>,
    retries = 2,
  ): Promise<T> {
    const url = `https://api.telegram.org/bot${this.token}/${method}`;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
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
      } catch (err) {
        if (attempt < retries) {
          const delay = 1000 * (attempt + 1);
          console.warn(`[telegram] API ${method} failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Unreachable");
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
          // Skip already processed updates (prevents duplicates on retry)
          if (this.processedUpdates.has(update.update_id)) {
            this.offset = update.update_id + 1;
            continue;
          }
          this.processedUpdates.add(update.update_id);
          this.offset = update.update_id + 1;

          // Keep the set from growing indefinitely (only keep last 100)
          if (this.processedUpdates.size > 100) {
            const oldest = Math.min(...this.processedUpdates);
            this.processedUpdates.delete(oldest);
          }

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

  async sendTyping(recipient: string): Promise<void> {
    const chatId = chatIdMap.get(recipient);
    if (!chatId) return;
    await this.api("sendChatAction", {
      chat_id: Number(chatId),
      action: "typing",
    });
  }

  async sendPlaceholder(recipient: string, text: string): Promise<string | undefined> {
    const chatId = chatIdMap.get(recipient);
    if (!chatId) return undefined;
    const result = await this.api<{ message_id: number }>("sendMessage", {
      chat_id: Number(chatId),
      text,
    });
    return String(result.message_id);
  }

  async editMessage(recipient: string, messageId: string, text: string): Promise<void> {
    const chatId = chatIdMap.get(recipient);
    if (!chatId) return;

    // Guard against empty text - Telegram rejects empty messages
    const safeText = text?.trim() || "...";
    const formatted = toTelegramMarkdown(safeText);

    const chunks = splitMessage(formatted, 4096);
    try {
      // Edit the placeholder with the first chunk
      await this.api("editMessageText", {
        chat_id: Number(chatId),
        message_id: Number(messageId),
        text: chunks[0],
        parse_mode: "MarkdownV2",
      });
      // Send remaining chunks as new messages
      for (let i = 1; i < chunks.length; i++) {
        await this.api("sendMessage", {
          chat_id: Number(chatId),
          text: chunks[i],
          parse_mode: "MarkdownV2",
        });
      }
    } catch {
      // Fallback to plain text
      console.warn("[telegram] MarkdownV2 parse failed in edit, falling back to plain text");
      const plainChunks = splitMessage(safeText, 4096);
      await this.api("editMessageText", {
        chat_id: Number(chatId),
        message_id: Number(messageId),
        text: plainChunks[0],
      });
      for (let i = 1; i < plainChunks.length; i++) {
        await this.api("sendMessage", {
          chat_id: Number(chatId),
          text: plainChunks[i],
        });
      }
    }
  }

  async send(recipient: string, text: string): Promise<void> {
    // Try mapped chat ID first, fall back to using recipient directly (for cron replies with raw chat IDs)
    const chatId = chatIdMap.get(recipient) ?? (/^\d+$/.test(recipient) ? recipient : null);
    if (!chatId) {
      console.error(
        `[telegram] No chat ID for recipient: ${recipient}`,
      );
      return;
    }

    // Guard against empty text
    const safeText = text?.trim() || "...";
    const formatted = toTelegramMarkdown(safeText);

    const chunks = splitMessage(formatted, 4096);
    for (const chunk of chunks) {
      try {
        await this.api("sendMessage", {
          chat_id: Number(chatId),
          text: chunk,
          parse_mode: "MarkdownV2",
        });
      } catch {
        // Fallback to plain text if MarkdownV2 parsing fails
        console.warn("[telegram] MarkdownV2 parse failed, falling back to plain text");
        const plainChunks = splitMessage(safeText, 4096);
        for (const plain of plainChunks) {
          await this.api("sendMessage", {
            chat_id: Number(chatId),
            text: plain,
          });
        }
        return;
      }
    }
  }

  async shutdown(): Promise<void> {
    this.running = false;
    console.log("[telegram] Bot stopped.");
  }
}

// In-memory map of username/id -> chatId
const chatIdMap = new Map<string, string>();

/**
 * Convert standard markdown (LLM output) to Telegram MarkdownV2.
 * Uses telegramify-markdown for proper AST-based conversion and escaping.
 */
function toTelegramMarkdown(text: string): string {
  try {
    return telegramifyMarkdown(text, "escape");
  } catch {
    // If conversion fails, return original text (will be sent as plain text)
    return text;
  }
}

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
