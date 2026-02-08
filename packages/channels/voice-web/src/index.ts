import type { Channel, Message } from "@jarvis/core";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { html } from "./ui.js";

export interface VoiceWebChannelOptions {
  port: number;
  openaiApiKey: string;
  systemPrompt: string;
  voice?: string;
  model?: string;
}

export class VoiceWebChannel implements Channel {
  name = "voice-web";

  private port: number;
  private openaiApiKey: string;
  private systemPrompt: string;
  private voice: string;
  private model: string;
  private server: ServerType | null = null;

  constructor(opts: VoiceWebChannelOptions) {
    this.port = opts.port;
    this.openaiApiKey = opts.openaiApiKey;
    this.systemPrompt = opts.systemPrompt;
    this.voice = opts.voice ?? "ash";
    this.model = opts.model ?? "gpt-4o-realtime-preview";
  }

  async initialize(
    _config: Record<string, unknown>,
    _onMessage: (msg: Message) => Promise<void>,
  ): Promise<void> {
    const app = new Hono();

    app.get("/", (c) => {
      return c.html(html);
    });

    app.post("/session", async (c) => {
      try {
        const res = await fetch(
          "https://api.openai.com/v1/realtime/sessions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.openaiApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: this.model,
              voice: this.voice,
              instructions: this.systemPrompt,
              input_audio_transcription: { model: "whisper-1" },
              tools: [
                {
                  type: "function",
                  name: "exa_search",
                  description:
                    "Search the web using Exa. Use when the user asks about current events, facts, or anything benefiting from a web search.",
                  parameters: {
                    type: "object",
                    properties: {
                      query: {
                        type: "string",
                        description: "The search query",
                      },
                      numResults: {
                        type: "number",
                        description:
                          "Number of results (default 5, max 10)",
                      },
                    },
                    required: ["query"],
                  },
                },
              ],
            }),
          },
        );

        if (!res.ok) {
          const errText = await res.text();
          console.error("[voice-web] OpenAI session error:", res.status, errText);
          return c.json({ error: "Failed to create session" }, 502);
        }

        const data = await res.json();
        return c.json(data);
      } catch (err) {
        console.error("[voice-web] Session endpoint error:", err);
        return c.json({ error: "Internal error" }, 500);
      }
    });

    app.post("/tool", async (c) => {
      try {
        const { name, arguments: args } = await c.req.json();

        if (name === "exa_search") {
          const apiKey = process.env.EXA_API_KEY;
          if (!apiKey) {
            return c.json({ error: "Exa not configured. Set EXA_API_KEY." });
          }

          const { query, numResults } = args as {
            query: string;
            numResults?: number;
          };
          const { Exa } = await import("exa-js");
          const exa = new Exa(apiKey);
          const res = await exa.searchAndContents(query, {
            numResults: Math.min(numResults || 5, 10),
            useAutoprompt: true,
            text: true,
          });

          const results = (res.results || []).map((r: any) => ({
            title: r.title,
            url: r.url,
            text: r.text ? r.text.slice(0, 500) : undefined,
          }));

          return c.json({ result: results });
        }

        return c.json({ error: `Unknown tool: ${name}` }, 400);
      } catch (err) {
        console.error("[voice-web] Tool error:", err);
        return c.json(
          {
            error:
              err instanceof Error ? err.message : "Tool execution failed",
          },
          500,
        );
      }
    });

    this.server = serve({ fetch: app.fetch, port: this.port }, () => {
      console.log(
        `[voice-web] Voice assistant running at http://localhost:${this.port}`,
      );
    });
  }

  async send(_recipient: string, _text: string): Promise<void> {
    // Voice channel doesn't support text pushes
  }

  async shutdown(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log("[voice-web] Server stopped.");
    }
  }
}
