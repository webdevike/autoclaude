/**
 * Gmail Extension for pi-mono
 *
 * Provides tools for reading and sending Gmail messages.
 * Initializes from environment variables on session_start.
 */

import { google } from "googleapis";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

let gmail: ReturnType<typeof google.gmail> | null = null;

export default function gmailExtension(pi: ExtensionAPI) {
  // Initialize Gmail client on session start
  pi.on("session_start", async () => {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      console.warn("[gmail] Missing OAuth2 credentials, extension disabled.");
      return;
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    gmail = google.gmail({ version: "v1", auth });
    console.log("[gmail] Extension initialized.");
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async () => {
    gmail = null;
    console.log("[gmail] Extension shutdown.");
  });

  // Register gmail_list_messages tool
  pi.registerTool({
    name: "gmail_list_messages",
    label: "List Gmail Messages",
    description: "List recent Gmail messages, optionally filtered by query",
    parameters: Type.Object({
      query: Type.Optional(
        Type.String({
          description: "Gmail search query (e.g. 'is:unread', 'from:boss@example.com'). Defaults to 'is:unread'",
        })
      ),
      maxResults: Type.Optional(
        Type.Number({
          description: "Max messages to return (default 10)",
        })
      ),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
      if (!gmail) {
        return {
          content: [{ type: "text", text: "Gmail not initialized. Check GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN environment variables." }],
          details: {},
        };
      }

      try {
        const res = await gmail.users.messages.list({
          userId: "me",
          q: params.query || "is:unread",
          maxResults: params.maxResults || 10,
        });

        const messages = res.data.messages ?? [];
        if (messages.length === 0) {
          return {
            content: [{ type: "text", text: "No messages found." }],
            details: {},
          };
        }

        const summaries = await Promise.all(
          messages.slice(0, 10).map(async (m) => {
            const full = await gmail!.users.messages.get({
              userId: "me",
              id: m.id!,
              format: "metadata",
              metadataHeaders: ["From", "Subject", "Date"],
            });
            const headers = full.data.payload?.headers ?? [];
            return {
              id: m.id,
              from: headers.find((h) => h.name === "From")?.value,
              subject: headers.find((h) => h.name === "Subject")?.value,
              date: headers.find((h) => h.name === "Date")?.value,
              snippet: full.data.snippet,
            };
          })
        );

        return {
          content: [{ type: "text", text: JSON.stringify(summaries, null, 2) }],
          details: {},
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error listing messages: ${error instanceof Error ? error.message : "Unknown error"}` }],
          details: {},
        };
      }
    },
  });

  // Register gmail_read_message tool
  pi.registerTool({
    name: "gmail_read_message",
    label: "Read Gmail Message",
    description: "Read the full content of a Gmail message by ID",
    parameters: Type.Object({
      messageId: Type.String({
        description: "The Gmail message ID",
      }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
      if (!gmail) {
        return {
          content: [{ type: "text", text: "Gmail not initialized. Check GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN environment variables." }],
          details: {},
        };
      }

      try {
        const msg = await gmail.users.messages.get({
          userId: "me",
          id: params.messageId,
          format: "full",
        });

        const headers = msg.data.payload?.headers ?? [];
        const body = extractBody(msg.data.payload as Record<string, unknown> | undefined);

        const result = {
          from: headers.find((h) => h.name === "From")?.value,
          to: headers.find((h) => h.name === "To")?.value,
          subject: headers.find((h) => h.name === "Subject")?.value,
          date: headers.find((h) => h.name === "Date")?.value,
          body,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: {},
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error reading message: ${error instanceof Error ? error.message : "Unknown error"}` }],
          details: {},
        };
      }
    },
  });

  // Register gmail_send tool
  pi.registerTool({
    name: "gmail_send",
    label: "Send Gmail",
    description: "Send an email via Gmail",
    parameters: Type.Object({
      to: Type.String({
        description: "Recipient email address",
      }),
      subject: Type.String({
        description: "Email subject",
      }),
      body: Type.String({
        description: "Email body (plain text)",
      }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
      if (!gmail) {
        return {
          content: [{ type: "text", text: "Gmail not initialized. Check GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN environment variables." }],
          details: {},
        };
      }

      try {
        const rawEmail = [
          `To: ${params.to}`,
          `Subject: ${params.subject}`,
          "Content-Type: text/plain; charset=utf-8",
          "",
          params.body,
        ].join("\n");

        const encoded = Buffer.from(rawEmail)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw: encoded },
        });

        return {
          content: [{ type: "text", text: `Email sent to ${params.to}` }],
          details: {},
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error sending email: ${error instanceof Error ? error.message : "Unknown error"}` }],
          details: {},
        };
      }
    },
  });
}

function extractBody(
  payload: Record<string, unknown> | undefined | null
): string {
  if (!payload) return "";

  const body = payload.body as Record<string, unknown> | undefined;
  if (body?.data) {
    return Buffer.from(body.data as string, "base64").toString("utf-8");
  }

  const parts = payload.parts as Array<Record<string, unknown>> | undefined;
  if (parts) {
    for (const part of parts) {
      if (part.mimeType === "text/plain") {
        const partBody = part.body as Record<string, unknown>;
        if (partBody?.data) {
          return Buffer.from(partBody.data as string, "base64").toString(
            "utf-8"
          );
        }
      }
    }
  }

  return "";
}
