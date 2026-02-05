/**
 * Coding task delegation to pi-coding-agent.
 *
 * Spawns pi-coding-agent in tmux for visibility and forwards streaming events
 * to Telegram via the gateway's onProgress callback.
 */

import { spawnSync } from "node:child_process";
import type { AuthStorage } from "@mariozechner/pi-coding-agent";
import { createAgentSession, createCodingTools } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { parseModelString } from "./pi-session.js";
import type { StreamProgressEvent } from "./types.js";

export interface CodingDelegationConfig {
  task: string;
  cwd: string;
  modelString: string;
  authStorage: AuthStorage;
  onProgress?: (event: StreamProgressEvent) => void;
}

/**
 * Spawn a tmux window for the coding agent session.
 * Creates session "jarvis-agents" if it doesn't exist.
 */
function spawnInTmux(cwd: string, sessionId: string): string {
  const windowName = `coding-${sessionId}`;

  // Check if tmux session exists, create if not
  const hasSession = spawnSync("tmux", ["has-session", "-t", "jarvis-agents"], { stdio: "ignore" });

  if (hasSession.status !== 0) {
    // Session doesn't exist, create it
    spawnSync("tmux", ["new-session", "-d", "-s", "jarvis-agents", "-n", windowName], {
      cwd,
      stdio: "ignore",
    });
    console.log(`[coding-delegate] Created tmux session: jarvis-agents`);
    return windowName;
  }

  // Session exists, create new window
  spawnSync("tmux", ["new-window", "-t", "jarvis-agents", "-n", windowName], {
    cwd,
    stdio: "ignore",
  });

  console.log(`[coding-delegate] Created tmux window: ${windowName}`);
  return windowName;
}

/**
 * Clean up tmux window after task completion.
 */
function killTmuxWindow(windowName: string): void {
  const result = spawnSync("tmux", ["kill-window", "-t", `jarvis-agents:${windowName}`], {
    stdio: "pipe",
  });

  if (result.status === 0) {
    console.log(`[coding-delegate] Killed tmux window: ${windowName}`);
  } else {
    const stderr = result.stderr?.toString().trim() || "unknown error";
    console.warn(`[coding-delegate] Failed to kill tmux window '${windowName}': ${stderr}`);

    // Diagnostic: check if session exists but window name is wrong
    const hasSession = spawnSync("tmux", ["has-session", "-t", "jarvis-agents"], { stdio: "ignore" });
    if (hasSession.status === 0) {
      const listResult = spawnSync("tmux", ["list-windows", "-t", "jarvis-agents", "-F", "#{window_name}"], { stdio: "pipe" });
      const windows = listResult.stdout?.toString().trim() || "";
      console.warn(`[coding-delegate] Current windows: ${windows}`);
    }
  }
}

/**
 * Delegate a coding task to pi-coding-agent.
 * Spawns in tmux for visibility, streams progress to Telegram.
 */
export async function delegateToCodingAgent(config: CodingDelegationConfig): Promise<string> {
  const { task, cwd, modelString, authStorage, onProgress } = config;

  // Parse model string to get provider and model
  const { provider, model: modelId } = parseModelString(modelString);

  // Get the model
  const model = getModel(provider as any, modelId as any);
  if (!model) {
    throw new Error(`Model not found: ${modelString}. Check provider and model ID.`);
  }

  console.log(`[coding-delegate] Creating coding agent session with model: ${provider}/${modelId}`);

  // Generate session ID for tmux window
  const sessionId = Math.random().toString(36).slice(2, 10);
  const windowName = spawnInTmux(cwd, sessionId);

  let accumulated = "";

  try {
    // Create coding tools for the agent
    const tools = createCodingTools(cwd);

    // Create agent session
    const { session } = await createAgentSession({
      model,
      authStorage,
      tools,
      cwd,
    });

    // Subscribe to streaming events
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "message_update") {
        const msgEvent = event.assistantMessageEvent;

        if (msgEvent.type === "text_delta") {
          const delta = msgEvent.delta;
          accumulated += delta;
          onProgress?.({
            type: "text_delta",
            delta,
            text: accumulated,
          });
        }
      } else if (event.type === "tool_execution_start") {
        onProgress?.({
          type: "tool_use",
          toolName: event.toolName,
        });
      }
    });

    try {
      // Prompt the agent with the coding task
      await session.prompt(task);

      // Extract final response from session messages
      const messages = session.state.messages;
      const lastMessage = messages[messages.length - 1];

      if (lastMessage && lastMessage.role === "assistant") {
        const textContent = lastMessage.content.filter((c: any) => c.type === "text");
        const finalText = textContent.map((c: any) => c.text).join("");

        if (finalText) {
          accumulated = finalText;
        }
      }

      onProgress?.({
        type: "done",
        finalText: accumulated,
      });

      return accumulated || "Coding task completed but no response generated.";
    } finally {
      unsubscribe();
    }
  } finally {
    // Clean up tmux window
    killTmuxWindow(windowName);
  }
}
