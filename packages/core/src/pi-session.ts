/**
 * Pi Coding Agent SDK integration for Jarvis.
 *
 * Uses @mariozechner/pi-coding-agent for proper session management,
 * streaming events, and model handling.
 */

import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ResourceLoader,
  createExtensionRuntime,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import type { StreamProgressEvent } from "./types.js";
import type { CoreToolDefinition } from "./tools/core-tools.js";

// Provider to environment variable mapping
const PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  groq: "GROQ_API_KEY",
};

/**
 * Parse a model string like "openrouter/anthropic/claude-3.5-haiku"
 * into provider and model parts.
 */
export function parseModelString(modelString: string): { provider: string; model: string } {
  const parts = modelString.split("/");
  if (parts.length >= 2) {
    const provider = parts[0];
    const model = parts.slice(1).join("/");
    return { provider, model };
  }
  // Default to openrouter if no provider specified
  return { provider: "openrouter", model: modelString };
}

/**
 * Create and configure AuthStorage with API keys from environment.
 */
export function createAuthStorage(): AuthStorage {
  const authStorage = new AuthStorage();

  // Set runtime API keys from environment variables
  for (const [provider, envKey] of Object.entries(PROVIDER_ENV_KEYS)) {
    const apiKey = process.env[envKey];
    if (apiKey) {
      authStorage.setRuntimeApiKey(provider, apiKey);
      console.log(`[pi-session] Set ${provider} API key from ${envKey}`);
    }
  }

  return authStorage;
}

/**
 * Create a minimal resource loader that sets a system prompt and optional extensions.
 */
function createMinimalResourceLoader(systemPrompt: string, extensions: any[] = []): ResourceLoader {
  const runtime = createExtensionRuntime();

  // Initialize extensions - call each factory with runtime
  for (const ext of extensions) {
    if (typeof ext === 'function') {
      try {
        ext(runtime);
        console.log('[pi-session] Loaded extension');
      } catch (err) {
        console.error('[pi-session] Failed to load extension:', err);
      }
    }
  }

  return {
    getExtensions: () => ({ extensions, errors: [], runtime }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getAppendSystemPrompt: () => [],
    getPathMetadata: () => new Map(),
    extendResources: () => {},
    reload: async () => {},
  };
}

export interface PiSessionConfig {
  modelString: string;
  systemPrompt: string;
  maxTokens?: number;
  authStorage?: AuthStorage;
  modelRegistry?: ModelRegistry;
  tools?: CoreToolDefinition[];
  cwd?: string;
  extensions?: any[]; // Pi-coding-agent extensions
}

export interface PiSessionResult {
  session: AgentSession;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
}

/**
 * Create a Pi agent session with the specified configuration.
 */
export async function createPiSession(config: PiSessionConfig): Promise<PiSessionResult> {
  const authStorage = config.authStorage ?? createAuthStorage();
  const modelRegistry = config.modelRegistry ?? new ModelRegistry(authStorage);

  const { provider, model: modelId } = parseModelString(config.modelString);

  // Get the model
  const model = getModel(provider as any, modelId as any);
  if (!model) {
    throw new Error(`Model not found: ${config.modelString}. Check provider and model ID.`);
  }

  console.log(`[pi-session] Creating session with model: ${provider}/${modelId}`);

  // Create in-memory settings with retry enabled
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 3, baseDelayMs: 1000 },
  });

  const resourceLoader = createMinimalResourceLoader(config.systemPrompt, config.extensions);

  // Convert our CoreToolDefinition to pi-coding-agent's ToolDefinition format
  const customTools = config.tools?.map((tool) => ({
    ...tool,
    execute: async (toolCallId: string, params: any, signal: AbortSignal | undefined, onUpdate: any) => {
      // Inject cwd context when calling the tool's execute function
      return tool.execute(toolCallId, params, signal, onUpdate, { cwd: config.cwd || process.cwd() });
    },
  }));

  const { session } = await createAgentSession({
    model,
    thinkingLevel: "off",
    authStorage,
    modelRegistry,
    resourceLoader,
    tools: [], // Don't use built-in tools
    customTools, // Use our custom tools
    sessionManager: SessionManager.inMemory(),
    settingsManager,
  });

  return { session, authStorage, modelRegistry };
}

/**
 * Send a prompt to a Pi session and stream the response.
 * Returns the final response text.
 */
export async function promptWithStreaming(
  session: AgentSession,
  prompt: string,
  onProgress?: (event: StreamProgressEvent) => void,
): Promise<string> {
  let accumulated = "";

  // Subscribe to events
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
    await session.prompt(prompt);

    // Get the final text from the session state
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

    return accumulated;
  } finally {
    unsubscribe();
  }
}

/**
 * Simple prompt without streaming - just returns the response.
 */
export async function promptSimple(
  session: AgentSession,
  prompt: string,
): Promise<string> {
  await session.prompt(prompt);

  const messages = session.state.messages;
  const lastMessage = messages[messages.length - 1];

  if (lastMessage && lastMessage.role === "assistant") {
    const textContent = lastMessage.content.filter((c: any) => c.type === "text");
    return textContent.map((c: any) => c.text).join("");
  }

  return "";
}
