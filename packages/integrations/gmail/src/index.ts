import { google } from "googleapis";
import type { Integration, ToolDefinition } from "@jarvis/core";

export class GmailIntegration implements Integration {
  name = "gmail";
  private gmail: ReturnType<typeof google.gmail> | null = null;

  tools: ToolDefinition[] = [
    {
      name: "gmail_list_messages",
      description:
        "List recent Gmail messages, optionally filtered by query",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Gmail search query (e.g. 'is:unread', 'from:boss@example.com')",
          },
          maxResults: {
            type: "number",
            description: "Max messages to return (default 10)",
          },
        },
      },
      execute: async (params) => {
        if (!this.gmail) return "Gmail not initialized";
        const res = await this.gmail.users.messages.list({
          userId: "me",
          q: (params.query as string) || "is:unread",
          maxResults: (params.maxResults as number) || 10,
        });

        const messages = res.data.messages ?? [];
        const summaries = await Promise.all(
          messages.slice(0, 10).map(async (m) => {
            const full = await this.gmail!.users.messages.get({
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
          }),
        );
        return JSON.stringify(summaries);
      },
    },
    {
      name: "gmail_read_message",
      description: "Read the full content of a Gmail message by ID",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "The Gmail message ID",
          },
        },
        required: ["messageId"],
      },
      execute: async (params) => {
        if (!this.gmail) return "Gmail not initialized";
        const msg = await this.gmail.users.messages.get({
          userId: "me",
          id: params.messageId as string,
          format: "full",
        });

        const headers = msg.data.payload?.headers ?? [];
        const body = extractBody(msg.data.payload as Record<string, unknown> | undefined);

        return JSON.stringify({
          from: headers.find((h) => h.name === "From")?.value,
          to: headers.find((h) => h.name === "To")?.value,
          subject: headers.find((h) => h.name === "Subject")?.value,
          date: headers.find((h) => h.name === "Date")?.value,
          body,
        });
      },
    },
    {
      name: "gmail_send",
      description: "Send an email via Gmail",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Recipient email address",
          },
          subject: {
            type: "string",
            description: "Email subject",
          },
          body: {
            type: "string",
            description: "Email body (plain text)",
          },
        },
        required: ["to", "subject", "body"],
      },
      execute: async (params) => {
        if (!this.gmail) return "Gmail not initialized";

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

        await this.gmail.users.messages.send({
          userId: "me",
          requestBody: { raw: encoded },
        });

        return `Email sent to ${params.to}`;
      },
    },
  ];

  async initialize(config: Record<string, unknown>): Promise<void> {
    const clientId =
      (config.clientId as string) || process.env.GMAIL_CLIENT_ID;
    const clientSecret =
      (config.clientSecret as string) || process.env.GMAIL_CLIENT_SECRET;
    const refreshToken =
      (config.refreshToken as string) || process.env.GMAIL_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      console.warn(
        "[gmail] Missing OAuth2 credentials, integration disabled.",
      );
      return;
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    this.gmail = google.gmail({ version: "v1", auth });
    console.log("[gmail] Initialized.");
  }

  async shutdown(): Promise<void> {
    this.gmail = null;
    console.log("[gmail] Shutdown.");
  }
}

function extractBody(
  payload: Record<string, unknown> | undefined | null,
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
            "utf-8",
          );
        }
      }
    }
  }

  return "";
}
