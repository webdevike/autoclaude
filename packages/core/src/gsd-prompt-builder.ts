/**
 * GSD Prompt Builder
 *
 * Reads GSD command markdown files from ~/.claude/commands/gsd/,
 * resolves @file references, replaces $ARGUMENTS, and produces
 * a flat system prompt suitable for runClaudeCode().
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

const GSD_COMMANDS_DIR = resolve(homedir(), ".claude", "commands", "gsd");

interface ParsedGsdCommand {
  frontmatter: Record<string, string | string[]>;
  body: string;
}

/**
 * Parse a GSD command markdown file into frontmatter and body.
 */
function parseCommandFile(content: string): ParsedGsdCommand {
  const frontmatter: Record<string, string | string[]> = {};
  let body = content;

  // Extract YAML frontmatter between --- delimiters
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (fmMatch) {
    const fmBlock = fmMatch[1];
    body = fmMatch[2];

    // Simple YAML parser for the frontmatter fields we care about
    let currentKey = "";
    for (const line of fmBlock.split("\n")) {
      const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
      if (kvMatch) {
        currentKey = kvMatch[1];
        const value = kvMatch[2].trim();
        if (value) {
          frontmatter[currentKey] = value;
        }
      } else if (line.match(/^\s+-\s+/) && currentKey) {
        // Array item
        const item = line.replace(/^\s+-\s+/, "").trim();
        const existing = frontmatter[currentKey];
        if (Array.isArray(existing)) {
          existing.push(item);
        } else {
          frontmatter[currentKey] = [item];
        }
      }
    }
  }

  return { frontmatter, body };
}

/**
 * Resolve a single @reference path.
 * Handles:
 *   @/absolute/path → reads from filesystem
 *   @.planning/... → relative to projectPath
 */
function resolveReference(ref: string, projectPath: string): string {
  let filePath: string;

  if (ref.startsWith("/")) {
    filePath = ref;
  } else if (ref.startsWith(".planning/") || ref.startsWith("./")) {
    filePath = resolve(projectPath, ref);
  } else {
    filePath = ref;
  }

  if (!existsSync(filePath)) {
    return `[File not found: ${ref}]`;
  }

  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return `[Error reading: ${ref}]`;
  }
}

/**
 * Resolve all @references in the command body.
 * Patterns:
 *   @/home/ike/.claude/get-shit-done/workflows/foo.md  → inline file content
 *   @.planning/STATE.md                                → inline relative file
 *
 * References in <execution_context> blocks are each on their own line.
 * References in <context> blocks may be inline.
 */
function resolveAllReferences(body: string, projectPath: string): string {
  // Replace all @/path and @.planning/ references
  return body.replace(/@(\/[^\s<>\n]+|\.planning\/[^\s<>\n]+|\.\/[^\s<>\n]+)/g, (_match, path) => {
    const content = resolveReference(path, projectPath);
    return `\n--- ${path} ---\n${content}\n--- end ---\n`;
  });
}

/**
 * Build a complete prompt from a GSD command name.
 *
 * @param commandName - The GSD command (e.g. "new-project", "plan-phase", "execute-phase")
 * @param args - The arguments string (replaces $ARGUMENTS in the template)
 * @param projectPath - The project directory for resolving relative @references
 * @returns The fully resolved prompt string, or null if command not found
 */
export function buildGsdPrompt(
  commandName: string,
  args: string,
  projectPath: string,
): string | null {
  const commandFile = resolve(GSD_COMMANDS_DIR, `${commandName}.md`);

  if (!existsSync(commandFile)) {
    return null;
  }

  let content: string;
  try {
    content = readFileSync(commandFile, "utf-8");
  } catch {
    return null;
  }

  const { body } = parseCommandFile(content);

  // Replace $ARGUMENTS with the actual args
  let prompt = body.replace(/\$ARGUMENTS/g, args || "");

  // Resolve all @references
  prompt = resolveAllReferences(prompt, projectPath);

  return prompt.trim();
}

/**
 * List all available GSD commands.
 */
export function listGsdCommands(): string[] {
  if (!existsSync(GSD_COMMANDS_DIR)) {
    return [];
  }

  try {
    return readdirSync(GSD_COMMANDS_DIR)
      .filter((f) => f.endsWith(".md") && !f.endsWith(".bak"))
      .map((f) => f.replace(".md", ""));
  } catch {
    return [];
  }
}
