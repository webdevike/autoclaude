/**
 * Core coding tools for Jarvis agent.
 *
 * Provides Read, Write, Edit, and Bash tools in pi-coding-agent format.
 * These tools enable the agent to interact with the filesystem and execute commands.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Type, type TObject } from "@sinclair/typebox";
import type { AgentToolResult } from "@mariozechner/pi-coding-agent";

// Maximum output size to prevent overwhelming the LLM context
const MAX_OUTPUT_SIZE = 50000; // 50KB
const MAX_LINES = 2000;

/**
 * Truncate text to a maximum size using head pattern (keep first N lines/chars).
 */
function truncateHead(text: string, maxSize: number, maxLines: number): string {
  let truncated = text;

  // First truncate by lines
  const lines = text.split("\n");
  if (lines.length > maxLines) {
    truncated = lines.slice(0, maxLines).join("\n");
    truncated += `\n... (truncated: ${lines.length - maxLines} more lines)`;
  }

  // Then truncate by size
  if (truncated.length > maxSize) {
    truncated = truncated.slice(0, maxSize);
    truncated += "\n... (truncated: output too long)";
  }

  return truncated;
}

/**
 * Tool definition compatible with pi-coding-agent format.
 * Note: This is a simplified version focused on the execute function.
 * Full tool definitions include renderCall and renderResult for UI.
 */
export interface CoreToolDefinition {
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
 * Read tool - Read file contents with optional line limits.
 */
function createReadTool(cwd: string): CoreToolDefinition {
  return {
    name: "Read",
    label: "Read",
    description: "Read file contents with optional line offset and limit. Returns content with line numbers like 'cat -n'.",
    parameters: Type.Object({
      file_path: Type.String({ description: "Absolute path to the file to read" }),
      offset: Type.Optional(Type.Number({ description: "Line number to start reading from (0-indexed)" })),
      limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { file_path, offset = 0, limit = MAX_LINES } = params as {
        file_path: string;
        offset?: number;
        limit?: number;
      };

      try {
        // Resolve path relative to cwd
        const absolutePath = resolve(cwd, file_path);

        if (!existsSync(absolutePath)) {
          return {
            content: [{ type: "text", text: `Error: File not found: ${file_path}` }],
            details: {},
          };
        }

        const content = readFileSync(absolutePath, "utf-8");
        const lines = content.split("\n");

        // Apply offset and limit
        const startLine = Math.max(0, offset);
        const endLine = Math.min(lines.length, startLine + limit);
        const selectedLines = lines.slice(startLine, endLine);

        // Add line numbers (1-indexed)
        const numberedLines = selectedLines.map((line, idx) => {
          const lineNum = startLine + idx + 1;
          return `${lineNum.toString().padStart(6, " ")}\t${line}`;
        });

        let output = numberedLines.join("\n");

        // Add truncation notice if needed
        if (endLine < lines.length) {
          output += `\n... (truncated: ${lines.length - endLine} more lines)`;
        }

        // Final size check
        output = truncateHead(output, MAX_OUTPUT_SIZE, MAX_LINES);

        return {
          content: [{ type: "text", text: output }],
          details: {},
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error reading file: ${err instanceof Error ? err.message : String(err)}` }],
          details: {},
        };
      }
    },
  };
}

/**
 * Write tool - Write content to a file.
 */
function createWriteTool(cwd: string): CoreToolDefinition {
  return {
    name: "Write",
    label: "Write",
    description: "Write content to a file. Creates parent directories if needed. Overwrites existing files.",
    parameters: Type.Object({
      file_path: Type.String({ description: "Absolute path to the file to write" }),
      content: Type.String({ description: "Content to write to the file" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { file_path, content } = params as {
        file_path: string;
        content: string;
      };

      try {
        // Resolve path relative to cwd
        const absolutePath = resolve(cwd, file_path);

        // Create parent directories if needed
        const dir = dirname(absolutePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        writeFileSync(absolutePath, content, "utf-8");

        return {
          content: [{ type: "text", text: `Successfully wrote ${content.length} bytes to ${file_path}` }],
          details: {},
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error writing file: ${err instanceof Error ? err.message : String(err)}` }],
          details: {},
        };
      }
    },
  };
}

/**
 * Edit tool - String replacement in files.
 */
function createEditTool(cwd: string): CoreToolDefinition {
  return {
    name: "Edit",
    label: "Edit",
    description: "Perform string replacement in a file. Validates that old_string exists and is unique (unless replace_all is true).",
    parameters: Type.Object({
      file_path: Type.String({ description: "Absolute path to the file to edit" }),
      old_string: Type.String({ description: "The exact string to replace" }),
      new_string: Type.String({ description: "The replacement string" }),
      replace_all: Type.Optional(Type.Boolean({ description: "Replace all occurrences (default: false, requires unique match)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { file_path, old_string, new_string, replace_all = false } = params as {
        file_path: string;
        old_string: string;
        new_string: string;
        replace_all?: boolean;
      };

      try {
        // Resolve path relative to cwd
        const absolutePath = resolve(cwd, file_path);

        if (!existsSync(absolutePath)) {
          return {
            content: [{ type: "text", text: `Error: File not found: ${file_path}` }],
            details: {},
          };
        }

        const content = readFileSync(absolutePath, "utf-8");

        // Check if old_string exists
        if (!content.includes(old_string)) {
          return {
            content: [{ type: "text", text: `Error: String not found in file: "${old_string.slice(0, 100)}..."` }],
            details: {},
          };
        }

        // Check uniqueness if not replace_all
        if (!replace_all) {
          const matches = content.split(old_string).length - 1;
          if (matches > 1) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: String appears ${matches} times in file. Use replace_all: true or provide a more specific old_string.`,
                },
              ],
              details: {},
            };
          }
        }

        // Perform replacement
        const newContent = replace_all
          ? content.split(old_string).join(new_string)
          : content.replace(old_string, new_string);

        const replacementCount = content.split(old_string).length - 1;

        writeFileSync(absolutePath, newContent, "utf-8");

        return {
          content: [
            {
              type: "text",
              text: `Successfully replaced ${replacementCount} occurrence${replacementCount > 1 ? "s" : ""} in ${file_path}`,
            },
          ],
          details: {},
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error editing file: ${err instanceof Error ? err.message : String(err)}` }],
          details: {},
        };
      }
    },
  };
}

/**
 * Bash tool - Execute shell commands.
 */
function createBashTool(cwd: string): CoreToolDefinition {
  return {
    name: "Bash",
    label: "Bash",
    description: "Execute a shell command and return the output. Commands run in the working directory.",
    parameters: Type.Object({
      command: Type.String({ description: "The shell command to execute" }),
      timeout: Type.Optional(Type.Number({ description: "Timeout in milliseconds (default: 120000)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { command, timeout = 120000 } = params as {
        command: string;
        timeout?: number;
      };

      try {
        const output = execSync(command, {
          cwd,
          encoding: "utf-8",
          timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB max output
          // Capture both stdout and stderr
          stdio: ["pipe", "pipe", "pipe"],
        });

        const truncatedOutput = truncateHead(output, MAX_OUTPUT_SIZE, MAX_LINES);

        return {
          content: [{ type: "text", text: truncatedOutput }],
          details: {},
        };
      } catch (err: any) {
        // execSync throws on non-zero exit codes
        const output = err.stdout || err.stderr || err.message || String(err);
        const truncatedOutput = truncateHead(output, MAX_OUTPUT_SIZE, MAX_LINES);

        return {
          content: [
            {
              type: "text",
              text: `Command failed (exit code ${err.status || "unknown"}):\n${truncatedOutput}`,
            },
          ],
          details: {},
        };
      }
    },
  };
}

/**
 * Create all core tools for the agent.
 *
 * @param cwd Working directory for tool execution
 * @returns Array of core tool definitions
 */
export function createCoreTools(cwd: string): CoreToolDefinition[] {
  return [
    createReadTool(cwd),
    createWriteTool(cwd),
    createEditTool(cwd),
    createBashTool(cwd),
  ];
}
