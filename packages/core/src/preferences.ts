/**
 * User preferences management with TypeBox schema validation.
 *
 * Preferences persist to JSON files at ~/.jarvis/users/{userId}/preferences.json
 * with atomic writes and schema validation.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/**
 * User preferences schema using TypeBox.
 *
 * additionalProperties: false ensures unknown keys are rejected during validation.
 */
export const UserPreferencesSchema = Type.Object(
  {
    tone: Type.Optional(Type.Union([
      Type.Literal("concise"),
      Type.Literal("detailed"),
      Type.Literal("casual"),
    ], { default: "detailed" })),

    verbosity: Type.Optional(Type.Union([
      Type.Literal("minimal"),
      Type.Literal("normal"),
      Type.Literal("verbose"),
    ], { default: "normal" })),

    shortcuts: Type.Optional(Type.Record(
      Type.String(),
      Type.String(),
      {
        default: {},
        maxProperties: 50,
        description: "User-defined shortcuts (max 50 entries)",
      }
    )),

    behavioralRules: Type.Optional(Type.Array(
      Type.String({ maxLength: 500 }),
      {
        default: [],
        maxItems: 20,
        description: "Custom behavioral rules for the agent (max 20 items, 500 chars each)",
      }
    )),

    defaultMode: Type.Optional(Type.String({ default: "personal" })),

    notificationPreferences: Type.Optional(Type.Object({
      statusUpdates: Type.Boolean({ default: true }),
      errorAlerts: Type.Boolean({ default: true }),
    }, { default: { statusUpdates: true, errorAlerts: true } })),
  },
  {
    additionalProperties: false,
    description: "User preferences for agent behavior and personalization",
  }
);

export type UserPreferences = Static<typeof UserPreferencesSchema>;

/**
 * Size warning threshold (100KB)
 */
const SIZE_WARNING_THRESHOLD = 100 * 1024;

/**
 * Manages user preferences with schema validation and atomic file writes.
 *
 * Features:
 * - TypeBox schema validation with Value.Check() and Value.Errors()
 * - Default value application with Value.Default()
 * - Atomic writes via temp file + fs.renameSync (POSIX atomic operation)
 * - Size warnings for preferences exceeding 100KB
 */
export class PreferencesManager {
  private preferencesDir: string;
  private preferencesPath: string;
  private preferences: UserPreferences | null = null;

  constructor(private userId: string) {
    this.preferencesDir = resolve(homedir(), ".jarvis", "users", userId);
    this.preferencesPath = resolve(this.preferencesDir, "preferences.json");
  }

  /**
   * Load preferences from disk with schema validation.
   *
   * Applies defaults for missing fields using Value.Default().
   * Validates against schema using Value.Check().
   *
   * @returns The loaded preferences (may be empty object with defaults applied)
   */
  load(): UserPreferences {
    if (this.preferences !== null) {
      return this.preferences;
    }

    // Ensure directory exists
    if (!existsSync(this.preferencesDir)) {
      mkdirSync(this.preferencesDir, { recursive: true });
    }

    // Load from file if exists
    if (existsSync(this.preferencesPath)) {
      try {
        const rawContent = readFileSync(this.preferencesPath, "utf-8");
        const parsed = JSON.parse(rawContent);

        // Apply defaults for missing fields
        const withDefaults = Value.Default(UserPreferencesSchema, parsed) as UserPreferences;

        // Validate against schema
        if (!Value.Check(UserPreferencesSchema, withDefaults)) {
          const errors = [...Value.Errors(UserPreferencesSchema, withDefaults)];
          console.error(`[preferences] Validation errors for user ${this.userId}:`, errors);

          // Log first few errors for debugging
          const errorSummary = errors
            .slice(0, 5)
            .map(err => `  - ${err.path}: ${err.message}`)
            .join("\n");

          console.error(`[preferences] Schema validation failed:\n${errorSummary}`);

          // Return defaults instead of invalid data
          return this.getDefaults();
        }

        // Check file size
        const fileSize = Buffer.byteLength(rawContent, "utf-8");
        if (fileSize > SIZE_WARNING_THRESHOLD) {
          console.warn(
            `[preferences] Warning: Preferences file for user ${this.userId} is ${fileSize} bytes ` +
            `(threshold: ${SIZE_WARNING_THRESHOLD} bytes)`
          );
        }

        this.preferences = withDefaults;
        return withDefaults;
      } catch (err) {
        console.error(`[preferences] Failed to load preferences for user ${this.userId}:`, err);
        return this.getDefaults();
      }
    }

    // No file exists - return defaults
    return this.getDefaults();
  }

  /**
   * Save preferences to disk with atomic write.
   *
   * Uses temp file + fs.renameSync for POSIX atomic write operation.
   * Validates before saving to prevent corruption.
   *
   * @param prefs The preferences to save
   * @throws Error if validation fails or write fails
   */
  save(prefs: UserPreferences): void {
    // Apply defaults
    const withDefaults = Value.Default(UserPreferencesSchema, prefs) as UserPreferences;

    // Validate before saving
    if (!Value.Check(UserPreferencesSchema, withDefaults)) {
      const errors = [...Value.Errors(UserPreferencesSchema, withDefaults)];
      const errorSummary = errors
        .slice(0, 5)
        .map(err => `${err.path}: ${err.message}`)
        .join("; ");

      throw new Error(`Preferences validation failed: ${errorSummary}`);
    }

    // Ensure directory exists
    if (!existsSync(this.preferencesDir)) {
      mkdirSync(this.preferencesDir, { recursive: true });
    }

    // Atomic write via temp file
    const tempPath = `${this.preferencesPath}.tmp`;
    const content = JSON.stringify(withDefaults, null, 2);

    try {
      writeFileSync(tempPath, content, "utf-8");
      renameSync(tempPath, this.preferencesPath);

      // Update in-memory cache
      this.preferences = withDefaults;

      // Check size
      const fileSize = Buffer.byteLength(content, "utf-8");
      if (fileSize > SIZE_WARNING_THRESHOLD) {
        console.warn(
          `[preferences] Warning: Saved preferences for user ${this.userId} is ${fileSize} bytes ` +
          `(threshold: ${SIZE_WARNING_THRESHOLD} bytes)`
        );
      }

      console.log(`[preferences] Saved preferences for user ${this.userId} (${fileSize} bytes)`);
    } catch (err) {
      console.error(`[preferences] Failed to save preferences for user ${this.userId}:`, err);
      throw err;
    }
  }

  /**
   * Get a specific preference value.
   *
   * @param key The preference key
   * @returns The value or undefined if not set
   */
  get<K extends keyof UserPreferences>(key: K): UserPreferences[K] | undefined {
    const prefs = this.load();
    return prefs[key];
  }

  /**
   * Set a specific preference value.
   *
   * @param key The preference key
   * @param value The value to set
   */
  set<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]): void {
    const prefs = this.load();
    const updated = { ...prefs, [key]: value };
    this.save(updated);
  }

  /**
   * Get all preferences.
   *
   * @returns Current preferences (with defaults applied)
   */
  getAll(): UserPreferences {
    return this.load();
  }

  /**
   * Get default preferences.
   *
   * @returns Empty object with defaults applied by TypeBox
   */
  private getDefaults(): UserPreferences {
    const defaults = Value.Default(UserPreferencesSchema, {}) as UserPreferences;
    this.preferences = defaults;
    return defaults;
  }
}
