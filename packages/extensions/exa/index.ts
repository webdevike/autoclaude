/**
 * Exa Web Search Extension for pi-mono
 *
 * Provides web search capability using Exa API.
 * Initializes from EXA_API_KEY environment variable on session_start.
 */

import Exa from "exa-js";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

let exa: Exa | null = null;

export default function exaExtension(pi: ExtensionAPI) {
  // Initialize Exa client on session start
  pi.on("session_start", async () => {
    const apiKey = process.env.EXA_API_KEY;

    if (!apiKey) {
      console.warn("[exa] Missing EXA_API_KEY environment variable, extension disabled.");
      return;
    }

    exa = new Exa(apiKey);
    console.log("[exa] Extension initialized.");
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async () => {
    exa = null;
    console.log("[exa] Extension shutdown.");
  });

  // Register exa_search tool
  pi.registerTool({
    name: "exa_search",
    label: "Web Search (Exa)",
    description: "Search the web using Exa. Returns high-quality search results with content snippets.",
    parameters: Type.Object({
      query: Type.String({
        description: "Search query",
      }),
      numResults: Type.Optional(
        Type.Number({
          description: "Number of results to return (default 10, max 20)",
        })
      ),
      useAutoprompt: Type.Optional(
        Type.Boolean({
          description: "Use Exa's autoprompt to improve query (default true)",
        })
      ),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
      if (!exa) {
        return {
          type: "text",
          text: "Exa not initialized. Check EXA_API_KEY environment variable.",
        };
      }

      try {
        const numResults = Math.min(params.numResults || 10, 20);
        const useAutoprompt = params.useAutoprompt !== undefined ? params.useAutoprompt : true;

        const searchResponse = await exa.searchAndContents(params.query, {
          numResults,
          useAutoprompt,
          text: true,
        });

        if (!searchResponse.results || searchResponse.results.length === 0) {
          return {
            type: "text",
            text: "No results found.",
          };
        }

        const results = searchResponse.results.map((r: any) => ({
          title: r.title,
          url: r.url,
          publishedDate: r.publishedDate,
          author: r.author,
          text: r.text ? r.text.slice(0, 500) + (r.text.length > 500 ? "..." : "") : undefined,
        }));

        return {
          type: "text",
          text: JSON.stringify(results, null, 2),
        };
      } catch (error) {
        return {
          type: "text",
          text: `Error searching: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  });
}
