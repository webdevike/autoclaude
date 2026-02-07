/**
 * Claude Code delegation via Agent SDK.
 *
 * Uses `@anthropic-ai/claude-agent-sdk` query() for in-process streaming
 * instead of spawning a subprocess. Same interface, no cold start.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { StreamProgressEvent } from "./types.js";

export interface ClaudeCodeConfig {
  prompt: string;
  systemPrompt?: string;
  sessionId?: string; // resume a previous conversation
  allowedTools?: string[];
  tools?: string[]; // limit available built-in tools (skips MCP loading)
  permissionMode?: "default" | "bypassPermissions" | "acceptEdits";
  cwd?: string;
  maxTurns?: number;
  onProgress?: (event: StreamProgressEvent) => void;
}

export interface ClaudeCodeResult {
  text: string;
  sessionId?: string;
}

/**
 * Run a prompt through the Claude Agent SDK with streaming output.
 * Returns the final text and session ID for continuity.
 */
export async function runClaudeCode(
  config: ClaudeCodeConfig,
): Promise<ClaudeCodeResult> {
  const {
    prompt,
    systemPrompt,
    sessionId,
    allowedTools,
    tools,
    permissionMode,
    cwd,
    maxTurns,
    onProgress,
  } = config;

  console.log(
    `[claude-code] Starting SDK query (resume=${sessionId ?? "none"})`,
  );

  const options: Parameters<typeof query>[0]["options"] = {
    includePartialMessages: true,
    settingSources: [] as const, // skip filesystem config for speed, no MCP
    cwd: cwd || process.cwd(),
    maxTurns,
    allowedTools,
    tools,
    permissionMode,
    allowDangerouslySkipPermissions: permissionMode === "bypassPermissions",
    resume: sessionId,
    systemPrompt: systemPrompt
      ? { type: "preset" as const, preset: "claude_code" as const, append: systemPrompt }
      : undefined,
  };

  let accumulated = "";
  let resultSessionId: string | undefined;
  let resultText: string | undefined;

  const conversation = query({ prompt, options });

  for await (const message of conversation) {
    // Streaming text deltas
    if (message.type === "stream_event") {
      const event = message.event as unknown as Record<string, unknown>;

      // Text delta
      const delta = event?.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        accumulated += delta.text;
        onProgress?.({
          type: "text_delta",
          delta: delta.text,
          text: accumulated,
        });
      }

      // Tool use start
      if (event?.type === "content_block_start") {
        const contentBlock = event.content_block as Record<string, unknown> | undefined;
        if (contentBlock?.type === "tool_use" && typeof contentBlock.name === "string") {
          onProgress?.({
            type: "tool_use",
            toolName: contentBlock.name,
          });
        }
      }

      // Capture session ID from any stream event
      if ("session_id" in message && typeof message.session_id === "string") {
        resultSessionId = message.session_id;
      }
    }

    // Final result
    if (message.type === "result") {
      const result = message as Record<string, unknown>;
      if (typeof result.result === "string") {
        resultText = result.result;
      }
      if (typeof result.session_id === "string") {
        resultSessionId = result.session_id;
      }
    }
  }

  const finalText = resultText || accumulated;

  if (!finalText) {
    throw new Error("Claude Agent SDK returned no output");
  }

  console.log(
    `[claude-code] Done. session=${resultSessionId ?? "none"}, len=${finalText.length}`,
  );

  onProgress?.({ type: "done", finalText });
  return { text: finalText, sessionId: resultSessionId };
}
