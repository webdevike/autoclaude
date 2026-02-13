/**
 * Claude Code delegation via Agent SDK.
 *
 * Uses `@anthropic-ai/claude-agent-sdk` query() for in-process streaming
 * instead of spawning a subprocess. Same interface, no cold start.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { StreamProgressEvent } from "./types.js";

export interface ClaudeCodeConfig {
  prompt: string;
  systemPrompt?: string;
  sessionId?: string; // resume a previous conversation
  model?: string; // Claude model ID (e.g. "claude-haiku-4-5-20251001")
  allowedTools?: string[];
  disallowedTools?: string[]; // tools to block (e.g. ["AskUserQuestion"])
  tools?: string[]; // limit available built-in tools (skips MCP loading)
  permissionMode?: "default" | "bypassPermissions" | "acceptEdits";
  allowDangerouslySkipPermissions?: boolean;
  settingSources?: ("user" | "project" | "local")[]; // which CLAUDE.md to load (default: [])
  cwd?: string;
  maxTurns?: number;
  mcpServers?: Record<string, McpServerConfig>;
  onProgress?: (event: StreamProgressEvent) => void;
  stderr?: (data: string) => void; // stderr callback for SDK debug output
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
    disallowedTools,
    tools,
    permissionMode,
    cwd,
    maxTurns,
    mcpServers,
    onProgress,
    stderr,
  } = config;

  console.log(
    `[claude-code] Starting SDK query (cwd=${cwd ?? "default"}, resume=${sessionId ?? "none"})`,
  );

  const options: Parameters<typeof query>[0]["options"] = {
    includePartialMessages: true,
    settingSources: config.settingSources ?? ([] as const),
    cwd: cwd || process.cwd(),
    model: config.model,
    maxTurns,
    allowedTools,
    disallowedTools,
    tools,
    permissionMode,
    allowDangerouslySkipPermissions: config.allowDangerouslySkipPermissions ?? false,
    resume: sessionId,
    mcpServers,
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

    // Stderr from SDK
    if ((message.type as string) === "stderr" && stderr) {
      const ev = message as unknown as Record<string, unknown>;
      if (typeof ev.data === "string") stderr(ev.data);
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

      // Handle SDK errors (e.g. SDKResultError)
      const errors = result.errors as Array<Record<string, unknown>> | undefined;
      if (!result.result && errors && errors.length > 0) {
        const subtype = result.subtype as string | undefined;
        const errorMsgs = errors.map(e => e.message ?? e.error ?? JSON.stringify(e)).join("; ");
        console.error(`[claude-code] SDK error (${subtype ?? "unknown"}): ${errorMsgs}`);

        if (subtype === "error_max_turns" && accumulated) {
          // Hit max turns — return accumulated text with a marker
          resultText = accumulated + "\n\n[Reached max turns limit]";
        } else {
          throw new Error(`Claude SDK error (${subtype ?? "unknown"}): ${errorMsgs}`);
        }
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
