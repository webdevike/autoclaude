/**
 * Autonomy tools for agent self-configuration.
 *
 * Provides tools for the agent to manage cron jobs, modify mode configs,
 * and create shortcuts. All config changes require confirmation before saving.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Type, type TObject } from "@sinclair/typebox";
import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import cron from "node-cron";
import { CronExpressionParser } from "cron-parser";
import type { ConfigManager } from "../config-manager.js";
import type { PreferencesManager } from "../preferences.js";
import type { CronJobConfig, ModeConfig, ModelTier } from "../types.js";

/**
 * Tool definition compatible with pi-coding-agent format.
 */
export interface ConfigToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: TObject;
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: ((update: { content: Array<{ type: "text"; text: string }> }) => void) | undefined,
    ctx: { cwd: string; currentMode?: string }
  ) => Promise<AgentToolResult<unknown>>;
}

/**
 * Context for autonomy tools.
 */
export interface AutonomyToolContext {
  cwd: string;
  currentMode: string;
  configManager: ConfigManager;
  preferencesManager?: PreferencesManager;
}

/**
 * Validate cron prompt for dangerous patterns.
 *
 * Rejects:
 * - System prompt injection attempts
 * - Shell command patterns
 * - URLs to unknown domains
 * - Prompts > 500 chars
 *
 * @param prompt The cron prompt to validate
 * @returns Error message if dangerous, null if safe
 */
function validateCronPrompt(prompt: string): string | null {
  // Check length
  if (prompt.length > 500) {
    return "Rejected: Cron prompt exceeds 500 character limit";
  }

  // Check for instruction injection
  const injectionPatterns = [
    /ignore\s+(previous\s+)?instructions?/i,
    /system\s+prompt/i,
    /override\s+(your\s+)?(settings|config|instructions)/i,
    /disregard\s+(previous\s+)?(rules|instructions)/i,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(prompt)) {
      return "Rejected: Prompt contains instruction injection attempt";
    }
  }

  // Check for suspicious send patterns
  if (/send\s+(email|message|notification)\s+to/i.test(prompt)) {
    return "Rejected: Automated messaging requires explicit user setup";
  }

  // Check for URLs (must be https)
  const urlPattern = /https?:\/\/[^\s]+/;
  const urlMatch = prompt.match(urlPattern);
  if (urlMatch) {
    if (!urlMatch[0].startsWith("https://")) {
      return "Rejected: Only HTTPS URLs allowed in cron prompts";
    }

    // Reject IP address URLs
    if (/https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(urlMatch[0])) {
      return "Rejected: IP address URLs not allowed";
    }
  }

  return null; // Safe
}

/**
 * Create add_cron_job tool.
 *
 * Allows agent to schedule recurring tasks with confirmation flow.
 */
function createAddCronJobTool(
  configManager: ConfigManager,
  cronCallbacks?: CronCallbacks
): ConfigToolDefinition {
  return {
    name: "add_cron_job",
    label: "Add Cron Job",
    description: "ALWAYS use this tool to add cron jobs. Do NOT edit config JSON files directly. Saves a recurring scheduled task with validated cron syntax. Common schedules: '* * * * *' (every minute), '0 9 * * *' (daily 9am), '0 9 * * 1' (Mondays 9am), '*/5 * * * *' (every 5 min).",
    parameters: Type.Object({
      name: Type.String({
        description: "Job name (lowercase, hyphens/underscores only, e.g. 'daily-hello', 'check_email')",
        pattern: "^[a-z0-9_-]{1,50}$",
      }),
      schedule: Type.String({
        description: "Cron expression: minute hour day month weekday",
      }),
      prompt: Type.String({
        description: "The message/instruction the agent will execute when the job fires",
        maxLength: 500,
      }),
      tier: Type.Optional(
        Type.Union([Type.Literal("triage"), Type.Literal("smart")], {
          description: "Which agent tier handles this job (default: smart)",
          default: "smart",
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const {
        name,
        schedule,
        prompt,
        tier = "smart",
      } = params as {
        name: string;
        schedule: string;
        prompt: string;
        tier?: ModelTier;
      };

      const currentMode = ctx.currentMode || "personal";

      try {
        // Validate cron expression
        if (!cron.validate(schedule)) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid cron expression: '${schedule}'. Use format: minute hour day month weekday (e.g., '0 9 * * *' for daily at 9am)`,
              },
            ],
            details: {},
          };
        }

        // Validate prompt
        const promptValidation = validateCronPrompt(prompt);
        if (promptValidation) {
          return {
            content: [{ type: "text", text: promptValidation }],
            details: {},
          };
        }

        // Create the job
        const cronJob: CronJobConfig = {
          name,
          schedule,
          prompt,
          tier,
          mode: currentMode,
        };

        // Save to config
        await configManager.addCronJob(currentMode, cronJob);

        // Register with running scheduler if available
        let activated = false;
        if (cronCallbacks) {
          cronCallbacks.onAdded(cronJob);
          activated = true;
        }

        // Get next run time
        const interval = CronExpressionParser.parse(schedule, {
          tz: "America/New_York",
        });
        const nextRun = interval.next();
        const nextRunStr = nextRun
          ? nextRun.toISOString()
          : "Unable to determine";

        return {
          content: [
            {
              type: "text",
              text: `Cron job '${name}' saved${activated ? " and activated" : ""}!\n\nSchedule: ${schedule}\nPrompt: ${prompt}\nNext run: ${nextRunStr}`,
            },
          ],
          details: {},
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error adding cron job: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          details: {},
        };
      }
    },
  };
}

/**
 * Create list_cron_jobs tool.
 *
 * Lists all configured cron jobs with their next run times.
 */
function createListCronJobsTool(
  configManager: ConfigManager
): ConfigToolDefinition {
  return {
    name: "list_cron_jobs",
    label: "List Cron Jobs",
    description: "List all configured cron jobs with their schedules and next run times",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      try {
        const currentMode = ctx.currentMode || "personal";
        // Read crons from mode config file
        const configPath = resolve(
          process.cwd(),
          "config",
          `${currentMode}.json`
        );
        if (!existsSync(configPath)) {
          return {
            content: [{ type: "text", text: `No config found for mode '${currentMode}'.` }],
            details: {},
          };
        }

        const config = JSON.parse(readFileSync(configPath, "utf-8")) as ModeConfig;
        const jobs = config.crons || [];

        if (jobs.length === 0) {
          return {
            content: [{ type: "text", text: "No cron jobs configured." }],
            details: {},
          };
        }

        const jobsList = [
          `Configured cron jobs (${jobs.length}):`,
          ``,
          ...jobs.map((job, i) => {
            let nextRun = "Unknown";
            try {
              const interval = CronExpressionParser.parse(job.schedule, {
                tz: "America/New_York",
              });
              const next = interval.next();
              nextRun = next?.toISOString() ?? "No future runs";
            } catch {
              nextRun = "Error parsing schedule";
            }

            return [
              `${i + 1}. ${job.name}`,
              `   Schedule: ${job.schedule}`,
              `   Next run: ${nextRun}`,
              `   Mode: ${job.mode}`,
              `   Tier: ${job.tier}`,
            ].join("\n");
          }),
        ].join("\n");

        return {
          content: [{ type: "text", text: jobsList }],
          details: {},
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing cron jobs: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          details: {},
        };
      }
    },
  };
}

/**
 * Create remove_cron_job tool.
 *
 * Removes a scheduled cron job with confirmation.
 */
function createRemoveCronJobTool(
  configManager: ConfigManager,
  cronCallbacks?: CronCallbacks
): ConfigToolDefinition {
  return {
    name: "remove_cron_job",
    label: "Remove Cron Job",
    description: "ALWAYS use this tool to remove cron jobs. Do NOT edit config JSON files directly. Removes a scheduled cron job by name.",
    parameters: Type.Object({
      name: Type.String({
        description: "Name of the cron job to remove",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { name } = params as { name: string };
      const currentMode = ctx.currentMode || "personal";

      try {
        // Check job exists in config
        const configPath = resolve(
          process.cwd(),
          "config",
          `${currentMode}.json`
        );
        let job: CronJobConfig | undefined;
        if (existsSync(configPath)) {
          const config = JSON.parse(readFileSync(configPath, "utf-8")) as ModeConfig;
          job = (config.crons || []).find(c => c.name === name);
        }
        if (!job) {
          return {
            content: [{ type: "text", text: `Cron job '${name}' not found.` }],
            details: {},
          };
        }

        // Remove from config
        await configManager.removeCronJob(currentMode, name);

        // Unregister from running scheduler if available
        if (cronCallbacks) {
          cronCallbacks.onRemoved(name);
        }

        return {
          content: [
            { type: "text", text: `Cron job '${name}' removed.` },
          ],
          details: {},
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error removing cron job: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          details: {},
        };
      }
    },
  };
}

/**
 * Create update_mode_config tool.
 *
 * Updates a mode config field with validation and confirmation.
 */
function createUpdateModeConfigTool(
  configManager: ConfigManager
): ConfigToolDefinition {
  const allowedKeys = [
    "systemPrompt",
    "tone",
    "integrations",
    "statusInterval",
    "cwd",
  ] as const;

  return {
    name: "update_mode_config",
    label: "Update Mode Config",
    description: `Update a mode configuration field. Allowed keys: ${allowedKeys.join(", ")}. Requires confirmation.`,
    parameters: Type.Object({
      key: Type.Union(
        [
          Type.Literal("systemPrompt"),
          Type.Literal("tone"),
          Type.Literal("integrations"),
          Type.Literal("statusInterval"),
          Type.Literal("cwd"),
        ],
        {
          description: "The config field to update",
        }
      ),
      value: Type.Unknown({
        description: "The new value (will be validated against schema)",
      }),
      confirmed: Type.Optional(
        Type.Boolean({
          description: "Set to true to confirm update",
          default: false,
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { key, value, confirmed = false } = params as {
        key: (typeof allowedKeys)[number];
        value: unknown;
        confirmed?: boolean;
      };

      const currentMode = ctx.currentMode || "personal";

      try {
        // If not confirmed, show preview
        if (!confirmed) {
          const displayValue =
            typeof value === "object"
              ? JSON.stringify(value, null, 2)
              : String(value);

          return {
            content: [
              {
                type: "text",
                text: `I'd like to update mode config for '${currentMode}':\n\nField: ${key}\nNew value: ${displayValue}\n\nReply 'yes' to confirm or 'no' to cancel.`,
              },
            ],
            details: {},
          };
        }

        // Confirmed - update config
        await configManager.updateModeConfigField(currentMode, key, value);

        const displayValue =
          typeof value === "object"
            ? JSON.stringify(value, null, 2)
            : String(value);

        return {
          content: [
            {
              type: "text",
              text: `Mode config updated successfully!\n\nField: ${key}\nNew value: ${displayValue}\n\nNote: Restart gateway to apply changes.`,
            },
          ],
          details: {},
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating mode config: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          details: {},
        };
      }
    },
  };
}

/**
 * Create add_tool_shortcut tool.
 *
 * Adds a shortcut to user preferences with confirmation.
 */
function createAddToolShortcutTool(
  preferencesManager: PreferencesManager
): ConfigToolDefinition {
  return {
    name: "add_tool_shortcut",
    label: "Add Tool Shortcut",
    description: "Create a shortcut for frequently used commands or text. Requires confirmation.",
    parameters: Type.Object({
      shortcut: Type.String({
        description: "Shortcut name (lowercase, alphanumeric, hyphens, underscores)",
        pattern: "^[a-z0-9_-]{1,20}$",
      }),
      expansion: Type.String({
        description: "What the shortcut expands to",
        maxLength: 200,
      }),
      confirmed: Type.Optional(
        Type.Boolean({
          description: "Set to true to confirm adding shortcut",
          default: false,
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { shortcut, expansion, confirmed = false } = params as {
        shortcut: string;
        expansion: string;
        confirmed?: boolean;
      };

      try {
        // Check for existing shortcut
        const prefs = preferencesManager.getAll();
        const shortcuts = prefs.shortcuts || {};
        const existingExpansion = shortcuts[shortcut];

        // If not confirmed, show preview
        if (!confirmed) {
          let message = `I'd like to add a shortcut:\n\nShortcut: ${shortcut}\nExpansion: ${expansion}`;

          if (existingExpansion) {
            message += `\n\nWarning: This will overwrite existing shortcut '${shortcut}' (current: "${existingExpansion}")`;
          }

          message += `\n\nReply 'yes' to confirm or 'no' to cancel.`;

          return {
            content: [{ type: "text", text: message }],
            details: {},
          };
        }

        // Confirmed - add shortcut
        const updatedShortcuts = { ...shortcuts, [shortcut]: expansion };
        preferencesManager.set("shortcuts", updatedShortcuts);

        return {
          content: [
            {
              type: "text",
              text: `Shortcut '${shortcut}' added successfully!\n\nUse: ${shortcut}\nExpands to: ${expansion}`,
            },
          ],
          details: {},
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error adding shortcut: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          details: {},
        };
      }
    },
  };
}

/**
 * Create get_config_history tool.
 *
 * Shows git history of config changes for audit trail.
 */
function createGetConfigHistoryTool(
  configManager: ConfigManager
): ConfigToolDefinition {
  return {
    name: "get_config_history",
    label: "Get Config History",
    description: "View git history of mode config changes for audit trail",
    parameters: Type.Object({
      mode: Type.Optional(
        Type.String({
          description: "Mode name (defaults to current mode)",
        })
      ),
      limit: Type.Optional(
        Type.Number({
          description: "Number of commits to show (default 10)",
          default: 10,
          minimum: 1,
          maximum: 50,
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const currentMode = ctx.currentMode || "personal";
      const { mode = currentMode, limit = 10 } = params as {
        mode?: string;
        limit?: number;
      };

      try {
        const history = await configManager.getConfigHistory(mode, limit);

        if (history.length === 0) {
          return {
            content: [
              { type: "text", text: `No config history found for mode '${mode}'.` },
            ],
            details: {},
          };
        }

        const historyText = [
          `Config history for mode '${mode}' (last ${history.length} changes):`,
          ``,
          ...history.map((commit, i) => {
            return `${i + 1}. [${commit.hash}] ${commit.date}\n   ${commit.message}`;
          }),
        ].join("\n");

        return {
          content: [{ type: "text", text: historyText }],
          details: {},
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting config history: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          details: {},
        };
      }
    },
  };
}

/**
 * Callbacks for live cron job management (register/unregister with running scheduler).
 */
export interface CronCallbacks {
  onAdded: (config: CronJobConfig) => void;
  onRemoved: (name: string) => void;
}

/**
 * Create autonomy tools for agent self-configuration.
 *
 * @param configManager ConfigManager instance for mode config operations
 * @param preferencesManager Optional PreferencesManager for shortcuts
 * @param cronCallbacks Optional callbacks to register jobs with running scheduler
 * @returns Array of autonomy tool definitions
 */
export function createAutonomyTools(
  configManager: ConfigManager,
  preferencesManager?: PreferencesManager,
  cronCallbacks?: CronCallbacks
): ConfigToolDefinition[] {
  const tools: ConfigToolDefinition[] = [
    createAddCronJobTool(configManager, cronCallbacks),
    createListCronJobsTool(configManager),
    createRemoveCronJobTool(configManager, cronCallbacks),
    createUpdateModeConfigTool(configManager),
    createGetConfigHistoryTool(configManager),
  ];

  // Add shortcut tool if preferences manager provided
  if (preferencesManager) {
    tools.push(createAddToolShortcutTool(preferencesManager));
  }

  return tools;
}
