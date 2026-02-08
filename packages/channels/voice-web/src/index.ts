import type { Channel, Message } from "@jarvis/core";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { html } from "./ui.js";

interface DinnerEntry {
  date: string;
  description: string;
  logged_at: string;
}

const DINNERS_PATH = resolve(
  process.env.JARVIS_DATA_DIR ?? "/app/data",
  "dinners.json",
);

function loadDinners(): DinnerEntry[] {
  try {
    return JSON.parse(readFileSync(DINNERS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveDinners(dinners: DinnerEntry[]): void {
  mkdirSync(resolve(DINNERS_PATH, ".."), { recursive: true });
  writeFileSync(DINNERS_PATH, JSON.stringify(dinners, null, 2));
}

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
                {
                  type: "function",
                  name: "log_dinner",
                  description:
                    "Log what was eaten for dinner. Call this whenever the user mentions what they had or are having for dinner, e.g. 'We had tacos tonight' or 'Dinner was salmon and rice'.",
                  parameters: {
                    type: "object",
                    properties: {
                      description: {
                        type: "string",
                        description:
                          "What was eaten, e.g. 'Tacos with guac and rice'",
                      },
                      date: {
                        type: "string",
                        description:
                          "Date in YYYY-MM-DD format. Defaults to today if not specified.",
                      },
                    },
                    required: ["description"],
                  },
                },
                {
                  type: "function",
                  name: "recall_dinners",
                  description:
                    "Look up past dinners. Use when the user asks what they had for dinner on a specific day, this week, or recently. Also use for questions like 'have we had pasta lately?'",
                  parameters: {
                    type: "object",
                    properties: {
                      date: {
                        type: "string",
                        description:
                          "Specific date to look up in YYYY-MM-DD format",
                      },
                      days: {
                        type: "number",
                        description:
                          "Number of days to look back (default 7)",
                      },
                      query: {
                        type: "string",
                        description:
                          "Optional keyword to filter by, e.g. 'pasta' or 'chicken'",
                      },
                    },
                  },
                },
                {
                  type: "function",
                  name: "update_dinner",
                  description:
                    "Update/correct a dinner entry. Use when the user says something like 'actually we had pizza not tacos on Monday' or 'change last night's dinner to burgers'.",
                  parameters: {
                    type: "object",
                    properties: {
                      date: {
                        type: "string",
                        description:
                          "Date of the dinner to update in YYYY-MM-DD format",
                      },
                      old_description: {
                        type: "string",
                        description:
                          "Keyword from the existing entry to match, if multiple entries exist for that date",
                      },
                      new_description: {
                        type: "string",
                        description:
                          "The corrected dinner description",
                      },
                    },
                    required: ["date", "new_description"],
                  },
                },
                {
                  type: "function",
                  name: "delete_dinner",
                  description:
                    "Delete a dinner entry. Use when the user wants to remove an entry, e.g. 'delete dinner for Monday' or 'remove that wrong entry'.",
                  parameters: {
                    type: "object",
                    properties: {
                      date: {
                        type: "string",
                        description:
                          "Date of the dinner to delete in YYYY-MM-DD format",
                      },
                      description: {
                        type: "string",
                        description:
                          "Optional keyword to match if multiple entries exist for that date",
                      },
                    },
                    required: ["date"],
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

        if (name === "log_dinner") {
          const { description, date } = args as {
            description: string;
            date?: string;
          };
          const dinners = loadDinners();
          const entry: DinnerEntry = {
            date: date ?? new Date().toISOString().slice(0, 10),
            description,
            logged_at: new Date().toISOString(),
          };
          dinners.push(entry);
          saveDinners(dinners);
          console.log(`[voice-web] Logged dinner: ${entry.date} — ${description}`);
          return c.json({ result: `Logged dinner for ${entry.date}: ${description}` });
        }

        if (name === "recall_dinners") {
          const { date, days, query } = args as {
            date?: string;
            days?: number;
            query?: string;
          };
          let dinners = loadDinners();

          if (date) {
            dinners = dinners.filter((d) => d.date === date);
          } else {
            const lookback = days ?? 7;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - lookback);
            const cutoffStr = cutoff.toISOString().slice(0, 10);
            dinners = dinners.filter((d) => d.date >= cutoffStr);
          }

          if (query) {
            const q = query.toLowerCase();
            dinners = dinners.filter((d) =>
              d.description.toLowerCase().includes(q),
            );
          }

          if (dinners.length === 0) {
            return c.json({ result: "No dinner entries found for that period." });
          }

          const summary = dinners
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((d) => `${d.date}: ${d.description}`)
            .join("\n");
          return c.json({ result: summary });
        }

        if (name === "update_dinner") {
          const { date, old_description, new_description } = args as {
            date: string;
            old_description?: string;
            new_description: string;
          };
          const dinners = loadDinners();
          const idx = dinners.findIndex((d) => {
            if (d.date !== date) return false;
            if (old_description) {
              return d.description.toLowerCase().includes(old_description.toLowerCase());
            }
            return true;
          });
          if (idx === -1) {
            return c.json({ result: `No dinner entry found for ${date}.` });
          }
          const old = dinners[idx].description;
          dinners[idx].description = new_description;
          dinners[idx].logged_at = new Date().toISOString();
          saveDinners(dinners);
          console.log(`[voice-web] Updated dinner ${date}: "${old}" → "${new_description}"`);
          return c.json({ result: `Updated ${date}: "${old}" → "${new_description}"` });
        }

        if (name === "delete_dinner") {
          const { date, description } = args as {
            date: string;
            description?: string;
          };
          const dinners = loadDinners();
          const idx = dinners.findIndex((d) => {
            if (d.date !== date) return false;
            if (description) {
              return d.description.toLowerCase().includes(description.toLowerCase());
            }
            return true;
          });
          if (idx === -1) {
            return c.json({ result: `No dinner entry found for ${date}.` });
          }
          const removed = dinners.splice(idx, 1)[0];
          saveDinners(dinners);
          console.log(`[voice-web] Deleted dinner ${date}: "${removed.description}"`);
          return c.json({ result: `Deleted dinner for ${date}: "${removed.description}"` });
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
