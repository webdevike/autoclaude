/**
 * Bridge Jarvis Integration tools → LiveKit Agent tools.
 *
 * Converts ToolDefinition (JSON Schema params) into llm.ToolContext
 * using llm.tool() from @livekit/agents.
 */

import { z } from "zod";
import { llm } from "@livekit/agents";
import type { Integration, ToolDefinition } from "@jarvis/core";

/**
 * Convert a JSON Schema property to a Zod type.
 */
function jsonSchemaPropertyToZod(
  prop: Record<string, unknown>,
  isRequired: boolean,
): z.ZodType {
  const desc = prop.description as string | undefined;

  let base: z.ZodType;
  switch (prop.type) {
    case "number":
      base = desc ? z.number().describe(desc) : z.number();
      break;
    case "boolean":
      base = desc ? z.boolean().describe(desc) : z.boolean();
      break;
    case "string":
    default:
      base = desc ? z.string().describe(desc) : z.string();
      break;
  }

  return isRequired ? base : base.optional();
}

/**
 * Convert a ToolDefinition's JSON Schema parameters to a Zod object.
 */
function jsonSchemaToZod(
  parameters: Record<string, unknown>,
): z.ZodObject<any> {
  const properties = (parameters.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const required = (parameters.required ?? []) as string[];

  const shape: Record<string, z.ZodType> = {};
  for (const [key, prop] of Object.entries(properties)) {
    shape[key] = jsonSchemaPropertyToZod(prop, required.includes(key));
  }

  return z.object(shape);
}

/**
 * Bridge a single Jarvis ToolDefinition into a LiveKit FunctionTool,
 * and add it to the provided ToolContext under its name.
 */
function bridgeTool(
  ctx: llm.ToolContext,
  td: ToolDefinition,
): void {
  ctx[td.name] = llm.tool({
    description: td.description,
    parameters: jsonSchemaToZod(td.parameters),
    execute: async (args) => {
      console.log(
        `[livekit-agent] Tool call: ${td.name}(${JSON.stringify(args)})`,
      );
      try {
        const result = await td.execute(args as Record<string, unknown>);
        console.log(
          `[livekit-agent] Tool result: ${result.slice(0, 200)}`,
        );
        return result;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Tool execution failed";
        console.error(`[livekit-agent] Tool error: ${msg}`);
        throw new llm.ToolError(msg);
      }
    },
  });
}

/**
 * Convert all tools from initialized integrations into an llm.ToolContext.
 */
export function bridgeIntegrationTools(
  integrations: Integration[],
): llm.ToolContext {
  const ctx: llm.ToolContext = {};

  for (const integration of integrations) {
    for (const td of integration.tools) {
      bridgeTool(ctx, td);
      console.log(
        `[livekit-agent] Bridged tool: ${td.name} (from ${integration.name})`,
      );
    }
  }

  return ctx;
}

/**
 * Build the Exa web search tool as an llm.FunctionTool.
 * Returns null if EXA_API_KEY is not set.
 */
export function buildExaTool(): llm.FunctionTool<any> | null {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return null;

  return llm.tool({
    description:
      "Search the web using Exa. Use when the user asks about current events, facts, or anything benefiting from a web search.",
    parameters: z.object({
      query: z.string().describe("The search query"),
      numResults: z
        .number()
        .optional()
        .describe("Number of results (default 5, max 10)"),
    }),
    execute: async (params) => {
      const { Exa } = await import("exa-js");
      const exa = new Exa(apiKey);
      const res = await exa.searchAndContents(params.query, {
        numResults: Math.min(params.numResults || 5, 10),
        useAutoprompt: true,
        text: true,
      });

      if (!res.results?.length) return "No results found.";

      const results = res.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        text: r.text ? r.text.slice(0, 500) : undefined,
      }));

      return JSON.stringify(results, null, 2);
    },
  });
}
