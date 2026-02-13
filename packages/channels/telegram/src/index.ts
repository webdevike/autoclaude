import type { Channel, Message, InlineKeyboardMarkup, CallbackQuery } from "@jarvis/core";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string };
    data?: string;
    message?: { message_id: number; chat: { id: number } };
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
  private callbackQueryHandler?: (query: CallbackQuery) => Promise<void>;

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

    // Register bot commands so they appear in Telegram's autocomplete menu
    await this.api("setMyCommands", {
      commands: [
        { command: "haiku", description: "Switch to Haiku (fast, default)" },
        { command: "sonnet", description: "Switch to Sonnet (balanced)" },
        { command: "opus", description: "Switch to Opus (smartest)" },
        { command: "model", description: "Show current model" },
        { command: "new", description: "Start a fresh conversation" },
        { command: "usage", description: "Show token usage today" },
        { command: "mode", description: "Show or switch modes" },
        { command: "tools", description: "Refresh Composio integrations" },
      ],
    }).catch((err: unknown) => {
      console.warn("[telegram] Failed to set bot commands:", err instanceof Error ? err.message : err);
    });

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

          // Handle callback queries (inline keyboard button presses)
          if (update.callback_query && this.callbackQueryHandler) {
            const cq = update.callback_query;
            // Answer the callback query to remove the loading indicator
            await this.api("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => {});
            await this.callbackQueryHandler(cq as CallbackQuery);
            continue;
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

    // Use plain text for streaming edits — partial markdown is invalid MarkdownV2
    // The final send() call will apply proper formatting
    const truncated = safeText.length > 4096 ? safeText.slice(0, 4093) + "..." : safeText;
    try {
      await this.api("editMessageText", {
        chat_id: Number(chatId),
        message_id: Number(messageId),
        text: truncated,
      });
    } catch {
      // Silently ignore edit failures during streaming (message unchanged, rate limit, etc.)
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
    const formatted = markdownToHtml(safeText);

    const chunks = splitMessage(formatted, 4096);
    for (const chunk of chunks) {
      try {
        await this.api("sendMessage", {
          chat_id: Number(chatId),
          text: chunk,
          parse_mode: "HTML",
        });
      } catch {
        // Fallback to plain text if HTML parsing fails
        console.warn("[telegram] HTML parse failed, falling back to plain text");
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

  async deleteMessage(recipient: string, messageId: string): Promise<void> {
    const chatId = chatIdMap.get(recipient) ?? (/^\d+$/.test(recipient) ? recipient : null);
    if (!chatId) return;
    try {
      await this.api("deleteMessage", {
        chat_id: Number(chatId),
        message_id: Number(messageId),
      });
    } catch {
      // Silently ignore delete failures
    }
  }

  async sendWithKeyboard(recipient: string, text: string, keyboard: InlineKeyboardMarkup): Promise<string | undefined> {
    const chatId = chatIdMap.get(recipient) ?? (/^\d+$/.test(recipient) ? recipient : null);
    if (!chatId) return undefined;
    const result = await this.api<{ message_id: number }>("sendMessage", {
      chat_id: Number(chatId),
      text,
      reply_markup: keyboard,
    });
    return String(result.message_id);
  }

  onCallbackQuery(handler: (query: CallbackQuery) => Promise<void>): void {
    this.callbackQueryHandler = handler;
  }

  async editMessageRemoveKeyboard(recipient: string, messageId: string, text: string): Promise<void> {
    const chatId = chatIdMap.get(recipient) ?? (/^\d+$/.test(recipient) ? recipient : null);
    if (!chatId) return;
    try {
      await this.api("editMessageText", {
        chat_id: Number(chatId),
        message_id: Number(messageId),
        text,
        reply_markup: { inline_keyboard: [] },
      });
    } catch {
      // Silently ignore edit failures
    }
  }

  async shutdown(): Promise<void> {
    this.running = false;
    console.log("[telegram] Bot stopped.");
  }
}

// In-memory map of username/id -> chatId
const chatIdMap = new Map<string, string>();

/** Escape HTML special chars */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Convert standard markdown (LLM output) to Telegram HTML.
 * HTML mode is far more reliable than MarkdownV2 with Telegram's API.
 */
function markdownToHtml(text: string): string {
  try {
    const preserved: string[] = [];
    const ph = (i: number) => `\x00PH${i}\x00`;

    let s = text;

    // 1. Extract fenced code blocks — preserve content as-is
    s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const tag = lang
        ? `<pre><code class="language-${esc(lang)}">${esc(code.replace(/\n$/, ""))}</code></pre>`
        : `<pre>${esc(code.replace(/\n$/, ""))}</pre>`;
      preserved.push(tag);
      return ph(preserved.length - 1);
    });

    // 2. Extract inline code
    s = s.replace(/`([^`]+)`/g, (_, code) => {
      preserved.push(`<code>${esc(code)}</code>`);
      return ph(preserved.length - 1);
    });

    // 3. Now escape HTML in the remaining text
    s = esc(s);

    // 4. Convert markdown formatting to HTML
    // Bold: **text** or __text__
    s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    s = s.replace(/__(.+?)__/g, "<b>$1</b>");
    // Italic: *text* or _text_ (but not inside bold)
    s = s.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<i>$1</i>");
    s = s.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, "<i>$1</i>");
    // Strikethrough: ~~text~~
    s = s.replace(/~~(.+?)~~/g, "<s>$1</s>");
    // Links: [text](url) — already HTML-escaped, unescape the brackets
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    // Headings: # text → bold (Telegram has no heading tag)
    s = s.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");
    // Blockquotes: lines starting with &gt; (already escaped)
    s = s.replace(/^&gt;\s?(.*)$/gm, "<blockquote>$1</blockquote>");
    // Merge adjacent blockquotes
    s = s.replace(/<\/blockquote>\n<blockquote>/g, "\n");
    // Unordered lists: - or * at start of line
    s = s.replace(/^[\t ]*[-*] (.*)$/gm, "  • $1");
    // Horizontal rules
    s = s.replace(/^---+$/gm, "———");

    // 5. Restore preserved code blocks
    s = s.replace(/\x00PH(\d+)\x00/g, (_, idx) => preserved[Number(idx)]);

    return s;
  } catch {
    return esc(text);
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
