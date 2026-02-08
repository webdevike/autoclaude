/**
 * SDK MCP Bridge — exposes Integration tools + autonomy tools as an
 * in-process MCP server that the Claude Code SDK can call.
 *
 * Uses createSdkMcpServer() from the Agent SDK so tools appear as
 * mcp__jarvis-tools__<tool_name> inside Claude Code.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import type { Integration, ToolDefinition, CronJobConfig } from "./types.js";
import type { ConfigManager } from "./config-manager.js";
import type { PreferencesManager } from "./preferences.js";
import type { CronCallbacks } from "./tools/autonomy-tools.js";

// Re-export for convenience
export const MCP_SERVER_NAME = "jarvis-tools";

/**
 * JSON-Schema property → Zod schema converter.
 *
 * Handles the flat schemas used by Integration tools:
 * string, number, boolean with optional required arrays.
 */
function jsonSchemaPropertyToZod(prop: Record<string, unknown>): z.ZodType {
  const desc = prop.description as string | undefined;
  switch (prop.type) {
    case "number": {
      const base = z.number().optional();
      return desc ? base.describe(desc) : base;
    }
    case "boolean": {
      const base = z.boolean().optional();
      return desc ? base.describe(desc) : base;
    }
    case "string":
    default: {
      const base = z.string().optional();
      return desc ? base.describe(desc) : base;
    }
  }
}

/**
 * Convert a ToolDefinition's JSON Schema parameters to a Zod object shape.
 */
function jsonSchemaToZodShape(
  parameters: Record<string, unknown>,
): Record<string, z.ZodType> {
  const properties = (parameters.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const required = (parameters.required ?? []) as string[];

  const shape: Record<string, z.ZodType> = {};
  for (const [key, prop] of Object.entries(properties)) {
    const base = jsonSchemaPropertyToZod(prop);
    // If not required, keep as optional (already is); if required, unwrap
    const desc = prop.description as string | undefined;
    if (required.includes(key)) {
      // Build a required version with description
      switch (prop.type) {
        case "number": {
          const r = z.number();
          shape[key] = desc ? r.describe(desc) : r;
          break;
        }
        case "boolean": {
          const r = z.boolean();
          shape[key] = desc ? r.describe(desc) : r;
          break;
        }
        case "string":
        default: {
          const r = z.string();
          shape[key] = desc ? r.describe(desc) : r;
          break;
        }
      }
    } else {
      shape[key] = base;
    }
  }
  return shape;
}

/**
 * Wrap a ToolDefinition into an SdkMcpToolDefinition.
 */
function wrapIntegrationTool(td: ToolDefinition) {
  const zodShape = jsonSchemaToZodShape(td.parameters);

  return tool(td.name, td.description, zodShape, async (args) => {
    try {
      const result = await td.execute(args as Record<string, unknown>);
      return { content: [{ type: "text" as const, text: result }] };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  });
}

// ---- Autonomy tools (cron + config + preferences) ----

function buildAutonomyMcpTools(
  configManager: ConfigManager,
  preferencesManager: PreferencesManager | undefined,
  cronCallbacks: CronCallbacks | undefined,
  currentMode: string,
) {
  const tools = [];

  // add_cron_job
  tools.push(
    tool(
      "add_cron_job",
      "Add a recurring scheduled task. Common schedules: '0 9 * * *' (daily 9am), '*/5 * * * *' (every 5 min).",
      {
        name: z.string(),
        schedule: z.string(),
        prompt: z.string(),
        tier: z.enum(["triage", "smart"]).optional(),
      },
      async (args) => {
        const { name, schedule, prompt, tier = "smart" } = args;
        try {
          // Lazy-import node-cron for validation
          const cron = await import("node-cron");
          if (!cron.validate(schedule)) {
            return {
              content: [{ type: "text" as const, text: `Invalid cron expression: '${schedule}'` }],
            };
          }
          const cronJob: CronJobConfig = { name, schedule, prompt, tier: tier as "triage" | "smart", mode: currentMode };
          await configManager.addCronJob(currentMode, cronJob);
          if (cronCallbacks) cronCallbacks.onAdded(cronJob);
          return {
            content: [
              { type: "text" as const, text: `Cron job '${name}' saved${cronCallbacks ? " and activated" : ""}! Schedule: ${schedule}` },
            ],
          };
        } catch (err) {
          return {
            content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      },
    ),
  );

  // remove_cron_job
  tools.push(
    tool(
      "remove_cron_job",
      "Remove a scheduled cron job by name.",
      { name: z.string() },
      async (args) => {
        try {
          await configManager.removeCronJob(currentMode, args.name);
          if (cronCallbacks) cronCallbacks.onRemoved(args.name);
          return { content: [{ type: "text" as const, text: `Cron job '${args.name}' removed.` }] };
        } catch (err) {
          return {
            content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      },
    ),
  );

  // list_cron_jobs
  tools.push(
    tool(
      "list_cron_jobs",
      "List all configured cron jobs with their schedules.",
      {},
      async () => {
        try {
          const { existsSync, readFileSync } = await import("node:fs");
          const { resolve } = await import("node:path");
          const configPath = resolve(process.cwd(), "config", `${currentMode}.json`);
          if (!existsSync(configPath)) {
            return { content: [{ type: "text" as const, text: "No config found." }] };
          }
          const config = JSON.parse(readFileSync(configPath, "utf-8"));
          const jobs = config.crons || [];
          if (jobs.length === 0) {
            return { content: [{ type: "text" as const, text: "No cron jobs configured." }] };
          }
          const text = jobs
            .map(
              (j: CronJobConfig, i: number) =>
                `${i + 1}. ${j.name} — ${j.schedule} — ${j.prompt.slice(0, 80)}`,
            )
            .join("\n");
          return { content: [{ type: "text" as const, text }] };
        } catch (err) {
          return {
            content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      },
    ),
  );

  // update_mode_config
  tools.push(
    tool(
      "update_mode_config",
      "Update a mode config field. Allowed: systemPrompt, tone, integrations, statusInterval, cwd.",
      {
        key: z.enum(["systemPrompt", "tone", "integrations", "statusInterval", "cwd"]),
        value: z.string(),
      },
      async (args) => {
        try {
          // Parse JSON if it looks like JSON, otherwise use raw string
          let parsedValue: unknown = args.value;
          try {
            parsedValue = JSON.parse(args.value);
          } catch {
            // keep as string
          }
          await configManager.updateModeConfigField(currentMode, args.key, parsedValue);
          return {
            content: [{ type: "text" as const, text: `Updated '${args.key}' in mode '${currentMode}'.` }],
          };
        } catch (err) {
          return {
            content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      },
    ),
  );

  // Preference tools
  if (preferencesManager) {
    tools.push(
      tool(
        "get_preference",
        "Get a user preference. Keys: tone, verbosity, shortcuts, behavioralRules, defaultMode, notificationPreferences.",
        {
          key: z.enum(["tone", "verbosity", "shortcuts", "behavioralRules", "defaultMode", "notificationPreferences"]),
        },
        async (args) => {
          try {
            const prefs = preferencesManager.getAll();
            const value = prefs[args.key as keyof typeof prefs];
            const display = value === undefined
              ? `'${args.key}' is not set (using default)`
              : `${args.key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`;
            return { content: [{ type: "text" as const, text: display }] };
          } catch (err) {
            return {
              content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
              isError: true,
            };
          }
        },
      ),
    );

    tools.push(
      tool(
        "set_preference",
        "Set a user preference. Keys: tone, verbosity, shortcuts, behavioralRules, defaultMode, notificationPreferences.",
        {
          key: z.enum(["tone", "verbosity", "shortcuts", "behavioralRules", "defaultMode", "notificationPreferences"]),
          value: z.string(),
        },
        async (args) => {
          try {
            let parsedValue: unknown = args.value;
            try {
              parsedValue = JSON.parse(args.value);
            } catch {
              // keep as string
            }
            preferencesManager.set(args.key as any, parsedValue as any);
            return { content: [{ type: "text" as const, text: `Preference '${args.key}' saved.` }] };
          } catch (err) {
            return {
              content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
              isError: true,
            };
          }
        },
      ),
    );
  }

  return tools;
}

// ---- Exa search tool ----

function buildExaMcpTool() {
  return tool(
    "exa_search",
    "Search the web using Exa. Returns high-quality results with content snippets.",
    {
      query: z.string(),
      numResults: z.number().optional(),
    },
    async (args) => {
      try {
        const apiKey = process.env.EXA_API_KEY;
        if (!apiKey) {
          return {
            content: [{ type: "text" as const, text: "Exa not configured. Set EXA_API_KEY." }],
          };
        }
        const { Exa } = await import("exa-js");
        const exa = new Exa(apiKey);
        const numResults = Math.min(args.numResults || 10, 20);
        const res = await exa.searchAndContents(args.query, {
          numResults,
          useAutoprompt: true,
          text: true,
        });

        if (!res.results?.length) {
          return { content: [{ type: "text" as const, text: "No results found." }] };
        }

        const results = res.results.map((r: any) => ({
          title: r.title,
          url: r.url,
          text: r.text ? r.text.slice(0, 500) : undefined,
        }));

        return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}

// ---- Main entry point ----

export interface CreateJarvisMcpServerOptions {
  integrations: Integration[];
  configManager: ConfigManager;
  preferencesManager?: PreferencesManager;
  cronCallbacks?: CronCallbacks;
  currentMode: string;
}

/**
 * Create an in-process MCP server exposing all jarvis tools to Claude Code SDK.
 *
 * Returns an McpSdkServerConfigWithInstance ready to pass as
 * `mcpServers: { "jarvis-tools": result }` in SDK query() options.
 */
export function createJarvisMcpServer(opts: CreateJarvisMcpServerOptions) {
  const mcpTools: any[] = [];

  // 1. Wrap all integration tools
  for (const integration of opts.integrations) {
    for (const td of integration.tools) {
      mcpTools.push(wrapIntegrationTool(td));
      console.log(`[jarvis-tools] Registered integration tool: ${td.name}`);
    }
  }

  // 2. Add autonomy tools (cron, config, preferences)
  const autonomyTools = buildAutonomyMcpTools(
    opts.configManager,
    opts.preferencesManager,
    opts.cronCallbacks,
    opts.currentMode,
  );
  for (const t of autonomyTools) {
    mcpTools.push(t);
    console.log(`[jarvis-tools] Registered autonomy tool: ${t.name}`);
  }

  // 3. Add Exa search
  if (process.env.EXA_API_KEY) {
    mcpTools.push(buildExaMcpTool());
    console.log("[jarvis-tools] Registered exa_search tool");
  }

  console.log(`[jarvis-tools] MCP server created with ${mcpTools.length} tools`);

  return createSdkMcpServer({
    name: MCP_SERVER_NAME,
    tools: mcpTools,
  });
}

/**
 * Get tool names for allowedTools list.
 * Returns names prefixed with `mcp__jarvis-tools__`.
 */
export function getJarvisToolNames(
  integrations: Integration[],
  hasExa: boolean,
  hasPreferences: boolean,
): string[] {
  const prefix = `mcp__${MCP_SERVER_NAME}__`;
  const names: string[] = [];

  // Integration tools
  for (const integration of integrations) {
    for (const td of integration.tools) {
      names.push(`${prefix}${td.name}`);
    }
  }

  // Autonomy tools (always present)
  names.push(
    `${prefix}add_cron_job`,
    `${prefix}remove_cron_job`,
    `${prefix}list_cron_jobs`,
    `${prefix}update_mode_config`,
  );

  if (hasPreferences) {
    names.push(`${prefix}get_preference`, `${prefix}set_preference`);
  }

  if (hasExa) {
    names.push(`${prefix}exa_search`);
  }

  return names;
}
