/**
 * Bridge Jarvis ToolDefinition[] → LiveKit Agent tools.
 *
 * Converts ToolDefinition (JSON Schema params) into llm.ToolContext
 * using llm.tool() from @livekit/agents.
 */

import { z } from "zod";
import { llm } from "@livekit/agents";
import type { ToolDefinition } from "@jarvis/core";

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
 * Convert all ToolDefinitions into an llm.ToolContext.
 */
export function bridgeTools(
  tools: ToolDefinition[],
): llm.ToolContext {
  const ctx: llm.ToolContext = {};

  for (const td of tools) {
    bridgeTool(ctx, td);
    console.log(
      `[livekit-agent] Bridged tool: ${td.name}`,
    );
  }

  return ctx;
}
