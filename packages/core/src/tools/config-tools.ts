/**
 * Config tools for agent access to user preferences.
 *
 * Provides get_preference and set_preference tools with TypeBox parameter schemas
 * and confirmation flow for safety.
 */

import { Type, type TObject } from "@sinclair/typebox";
import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import type { PreferencesManager } from "../preferences.js";
import { UserPreferencesSchema } from "../preferences.js";

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
    ctx: { cwd: string }
  ) => Promise<AgentToolResult<unknown>>;
}

/**
 * Valid preference keys from UserPreferencesSchema.
 */
const VALID_KEYS = [
  "tone",
  "verbosity",
  "shortcuts",
  "behavioralRules",
  "defaultMode",
  "notificationPreferences",
] as const;

/**
 * Validate preference value for dangerous patterns.
 *
 * Rejects:
 * - Shell command patterns (e.g., `rm -rf`, `$(...)`, backticks)
 * - Suspicious URLs (non-https, IP addresses, known malicious TLDs)
 * - Template literal syntax (${...})
 * - Script tags or HTML injection patterns
 *
 * @param value The value to validate
 * @returns Error message if dangerous, null if safe
 */
function validatePreferenceValue(value: unknown): string | null {
  if (typeof value !== "string") {
    // Non-string values (objects, arrays, booleans) are validated by schema
    return null;
  }

  // Check for shell command injection patterns
  const shellPatterns = [
    /\$\(/,           // Command substitution: $(...)
    /`/,              // Backtick command substitution
    /;\s*(rm|sudo|curl|wget|nc|bash|sh|eval)/i,  // Command chaining
    /\|\s*(rm|sudo|curl|wget|nc|bash|sh|eval)/i, // Pipe to dangerous commands
    /&&\s*(rm|sudo|curl|wget|nc|bash|sh|eval)/i, // AND chain to dangerous commands
  ];

  for (const pattern of shellPatterns) {
    if (pattern.test(value)) {
      return "Rejected: Preference contains shell command patterns";
    }
  }

  // Check for template literal injection
  if (/\$\{.*\}/.test(value)) {
    return "Rejected: Preference contains template literal syntax";
  }

  // Check for script injection patterns
  const scriptPatterns = [
    /<script/i,
    /javascript:/i,
    /onerror=/i,
    /onclick=/i,
  ];

  for (const pattern of scriptPatterns) {
    if (pattern.test(value)) {
      return "Rejected: Preference contains potential script injection";
    }
  }

  // Check for suspicious URLs (if value looks like a URL)
  if (value.startsWith("http://") || value.includes("://")) {
    // Allow https:// and common safe protocols
    if (!value.startsWith("https://") && !value.startsWith("mailto:")) {
      return "Rejected: Only HTTPS URLs are allowed in preferences";
    }

    // Reject IP address URLs
    if (/https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(value)) {
      return "Rejected: IP address URLs are not allowed";
    }
  }

  return null; // Safe
}

/**
 * Create get_preference tool.
 *
 * Returns current preference value or "not set (using default)".
 */
function createGetPreferenceTool(preferencesManager: PreferencesManager): ConfigToolDefinition {
  return {
    name: "get_preference",
    label: "Get Preference",
    description: "Get a user preference value. Valid keys: tone, verbosity, shortcuts, behavioralRules, defaultMode, notificationPreferences",
    parameters: Type.Object({
      key: Type.Union([
        Type.Literal("tone"),
        Type.Literal("verbosity"),
        Type.Literal("shortcuts"),
        Type.Literal("behavioralRules"),
        Type.Literal("defaultMode"),
        Type.Literal("notificationPreferences"),
      ], {
        description: "The preference key to retrieve",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { key } = params as { key: typeof VALID_KEYS[number] };

      try {
        const prefs = preferencesManager.getAll();
        const value = prefs[key];

        if (value === undefined) {
          return {
            content: [{ type: "text", text: `Preference '${key}' is not set (using default)` }],
            details: {},
          };
        }

        // Format value for display
        const displayValue = typeof value === "object"
          ? JSON.stringify(value, null, 2)
          : String(value);

        return {
          content: [{ type: "text", text: `${key}: ${displayValue}` }],
          details: {},
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error reading preference: ${err instanceof Error ? err.message : String(err)}` }],
          details: {},
        };
      }
    },
  };
}

/**
 * Create set_preference tool.
 *
 * Validates key against schema, checks value for dangerous patterns,
 * and requires confirmation before saving.
 */
function createSetPreferenceTool(preferencesManager: PreferencesManager): ConfigToolDefinition {
  return {
    name: "set_preference",
    label: "Set Preference",
    description: "Set a user preference value. Requires confirmation before saving. Valid keys: tone, verbosity, shortcuts, behavioralRules, defaultMode, notificationPreferences",
    parameters: Type.Object({
      key: Type.Union([
        Type.Literal("tone"),
        Type.Literal("verbosity"),
        Type.Literal("shortcuts"),
        Type.Literal("behavioralRules"),
        Type.Literal("defaultMode"),
        Type.Literal("notificationPreferences"),
      ], {
        description: "The preference key to set",
      }),
      value: Type.Unknown({ description: "The value to set (will be validated against schema)" }),
      confirmed: Type.Optional(Type.Boolean({
        description: "Set to true to confirm saving the preference",
        default: false,
      })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { key, value, confirmed = false } = params as {
        key: typeof VALID_KEYS[number];
        value: unknown;
        confirmed?: boolean;
      };

      try {
        // Validate value for dangerous patterns
        const dangerCheck = validatePreferenceValue(value);
        if (dangerCheck) {
          return {
            content: [{ type: "text", text: dangerCheck }],
            details: {},
          };
        }

        // If not confirmed, return confirmation request
        if (!confirmed) {
          const displayValue = typeof value === "object"
            ? JSON.stringify(value, null, 2)
            : String(value);

          return {
            content: [
              {
                type: "text",
                text: `I'd like to save preference '${key}' = ${displayValue}. Reply 'yes' to confirm or 'no' to cancel.`,
              },
            ],
            details: {},
          };
        }

        // Confirmed - attempt to save
        preferencesManager.set(key as any, value as any);

        const displayValue = typeof value === "object"
          ? JSON.stringify(value, null, 2)
          : String(value);

        return {
          content: [{ type: "text", text: `Preference '${key}' saved successfully: ${displayValue}` }],
          details: {},
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error setting preference: ${err instanceof Error ? err.message : String(err)}` }],
          details: {},
        };
      }
    },
  };
}

/**
 * Create config tools for preference access.
 *
 * @param preferencesManager The PreferencesManager instance for this user
 * @returns Array of config tool definitions (get_preference, set_preference)
 */
export function createConfigTools(preferencesManager: PreferencesManager): ConfigToolDefinition[] {
  return [
    createGetPreferenceTool(preferencesManager),
    createSetPreferenceTool(preferencesManager),
  ];
}
