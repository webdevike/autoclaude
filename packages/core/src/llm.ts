import { getModel, complete, stream } from "@mariozechner/pi-ai";
import type { Model, Context, AssistantMessage, AssistantMessageEvent, Api, Tool } from "@mariozechner/pi-ai";
import type { ModelConfig, ToolDefinition } from "./types.js";

/**
 * Parse a model string in "provider/model" format.
 * Examples:
 *   "anthropic/claude-3-5-sonnet-20241022" -> { provider: "anthropic", model: "claude-3-5-sonnet-20241022" }
 *   "openrouter/anthropic/claude-3.5-sonnet" -> { provider: "openrouter", model: "anthropic/claude-3.5-sonnet" }
 *   "openai/gpt-4o" -> { provider: "openai", model: "gpt-4o" }
 */
export function parseModel(modelString: string): {
  provider: string;
  model: string;
} {
  const parts = modelString.split("/");
  if (parts.length >= 2) {
    // For openrouter, the model slug itself can contain slashes
    // e.g. "openrouter/anthropic/claude-3.5-sonnet"
    const provider = parts[0];
    const model = parts.slice(1).join("/");
    return { provider, model };
  }
  // Default to openrouter if no provider prefix
  return { provider: "openrouter", model: modelString };
}

/**
 * Create a pi-ai Model instance from a model string.
 * Reads API keys from environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY).
 */
export function createModel(modelString: string): Model<Api> {
  const { provider, model } = parseModel(modelString);

  // Map our provider names to pi-ai provider names
  const providerMap: Record<string, string> = {
    "anthropic": "anthropic",
    "openai": "openai",
    "openrouter": "openrouter",
  };

  const piProvider = providerMap[provider];
  if (!piProvider) {
    throw new Error(`Unsupported provider: ${provider}. Supported: anthropic, openai, openrouter`);
  }

  // pi-ai reads API keys from environment variables automatically
  return getModel(piProvider as any, model as any) as Model<Api>;
}

/**
 * Convert our ToolDefinition format to pi-ai's Tool format
 */
function convertTools(tools?: ToolDefinition[]): Tool[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters as any,
  }));
}

/**
 * Non-streaming LLM completion using pi-ai.
 * Used for triage and simple requests.
 */
export async function completeLLM(
  model: Model<Api>,
  context: Context,
  options?: {
    tools?: ToolDefinition[];
    maxTokens?: number;
  }
): Promise<AssistantMessage> {
  const response = await complete(model, {
    ...context,
    tools: convertTools(options?.tools),
  }, {
    maxTokens: options?.maxTokens,
  });

  return response;
}

/**
 * Streaming LLM completion using pi-ai.
 * Returns an async iterable of stream events.
 * Used for smart agents to provide progressive updates.
 */
export async function* streamLLM(
  model: Model<Api>,
  context: Context,
  options?: {
    tools?: ToolDefinition[];
    maxTokens?: number;
  }
): AsyncIterable<AssistantMessageEvent> {
  const streamIterator = stream(model, {
    ...context,
    tools: convertTools(options?.tools),
  }, {
    maxTokens: options?.maxTokens,
  });

  for await (const event of streamIterator) {
    yield event;
  }
}

// ============================================================================
// TEMPORARY COMPATIBILITY SHIM
// This LLMClient class maintains backwards compatibility with agent.ts.
// It will be removed in Plan 02 when agent.ts is rewritten to use pi-ai directly.
// ============================================================================

interface LLMRequest {
  model: ModelConfig;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  tools?: ToolDefinition[];
  maxTokens?: number;
}

interface LLMResponse {
  text: string;
  toolCalls?: Array<{
    name: string;
    params: Record<string, unknown>;
  }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export class LLMClient {
  constructor(
    private keys: {
      anthropic?: string;
      openai?: string;
      openrouter?: string;
    },
    private fallbackProvider?: string,
  ) {
    // Set environment variables for pi-ai to use
    if (keys.anthropic) process.env.ANTHROPIC_API_KEY = keys.anthropic;
    if (keys.openai) process.env.OPENAI_API_KEY = keys.openai;
    if (keys.openrouter) process.env.OPENROUTER_API_KEY = keys.openrouter;
  }

  async chat(request: LLMRequest, retries = 2): Promise<LLMResponse> {
    const model = createModel(request.model.model);

    // Convert messages to pi-ai format
    const piMessages: any[] = request.messages.map(m => {
      if (m.role === "user") {
        return {
          role: "user",
          content: m.content,
          timestamp: Date.now(),
        };
      } else {
        // Assistant message - need to convert to content array
        return {
          role: "assistant",
          content: [{ type: "text", text: m.content }],
          api: model.api,
          provider: model.provider,
          model: model.name,
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: "stop" as const,
          timestamp: Date.now(),
        };
      }
    });

    const context: Context = {
      systemPrompt: request.systemPrompt,
      messages: piMessages,
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await completeLLM(model, context, {
          tools: request.tools,
          maxTokens: request.maxTokens ?? request.model.maxTokens,
        });

        // Extract text from content array
        const textContent = response.content.filter(c => c.type === "text");
        const text = textContent.map(c => (c as any).text).join("");

        // Extract tool calls from content array
        const toolCallContent = response.content.filter(c => c.type === "toolCall");
        const toolCalls = toolCallContent.map(tc => {
          const call = tc as any;
          return {
            name: call.name,
            params: call.arguments as Record<string, unknown>,
          };
        });

        return {
          text: text || "",
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          usage: {
            inputTokens: response.usage.input || 0,
            outputTokens: response.usage.output || 0,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isRetryable = msg.includes("Unexpected end of JSON") ||
          msg.includes("ECONNRESET") ||
          msg.includes("fetch failed");

        if (isRetryable && attempt < retries) {
          const delay = 1000 * (attempt + 1);
          console.warn(`[llm] Transient error (attempt ${attempt + 1}/${retries + 1}): ${msg}, retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }

    throw new Error("Unreachable");
  }
}
