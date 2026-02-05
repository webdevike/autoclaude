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
