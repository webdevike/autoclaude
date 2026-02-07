import { getModel, complete, stream } from "@mariozechner/pi-ai";
import type { Model, Context, AssistantMessage, AssistantMessageEvent, Api, Tool } from "@mariozechner/pi-ai";
import type { ToolDefinition } from "./types.js";

// Re-export types for consumers
export type { Model, Context, AssistantMessage, AssistantMessageEvent, Api };

/**
 * Parse a model string in "provider/model" format.
 */
export function parseModel(modelString: string): {
  provider: string;
  model: string;
} {
  const parts = modelString.split("/");
  if (parts.length >= 2) {
    const provider = parts[0];
    const model = parts.slice(1).join("/");
    return { provider, model };
  }
  return { provider: "openrouter", model: modelString };
}

/**
 * Create a pi-ai Model instance from a model string.
 */
export function createModel(modelString: string): Model<Api> {
  const { provider, model } = parseModel(modelString);

  const providerMap: Record<string, string> = {
    "anthropic": "anthropic",
    "openai": "openai",
    "openrouter": "openrouter",
  };

  const piProvider = providerMap[provider];
  if (!piProvider) {
    throw new Error(`Unsupported provider: ${provider}. Supported: anthropic, openai, openrouter`);
  }

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
 * Filter out empty assistant messages that can cause API errors.
 * APIs reject messages with empty content.
 */
function filterEmptyMessages(messages: Context["messages"]): Context["messages"] {
  return messages.filter(msg => {
    // Keep all user messages
    if (msg.role === "user") return true;

    // For assistant messages, check if content is non-empty
    if (msg.role === "assistant") {
      const content = (msg as any).content;
      // Handle both string content and array content
      if (typeof content === "string") {
        return content.trim().length > 0;
      }
      if (Array.isArray(content)) {
        return content.length > 0;
      }
      // If content is missing/undefined, filter it out
      return false;
    }

    // Keep other message types (toolResult, etc.)
    return true;
  });
}

/**
 * Non-streaming LLM completion using pi-ai.
 */
export async function completeLLM(
  model: Model<Api>,
  context: Context,
  options?: {
    tools?: ToolDefinition[];
    maxTokens?: number;
  }
): Promise<AssistantMessage> {
  // Filter out empty messages before sending to API
  const filteredMessages = filterEmptyMessages(context.messages);

  const filteredContext: Context = {
    ...context,
    messages: filteredMessages,
  };

  console.log(`[llm] Calling pi-ai complete() with ${filteredMessages.length} messages`);

  try {
    const response = await complete(model, {
      ...filteredContext,
      tools: convertTools(options?.tools),
    }, {
      maxTokens: options?.maxTokens,
    });

    console.log(`[llm] pi-ai response: stopReason=${response.stopReason}, content=${JSON.stringify(response.content).slice(0, 200)}`);

    if (response.stopReason === "error") {
      console.error(`[llm] pi-ai error: ${response.errorMessage}`);
    }

    return response;
  } catch (err) {
    console.error(`[llm] pi-ai threw:`, err);
    throw err;
  }
}

/**
 * Streaming LLM completion using pi-ai.
 */
export async function* streamLLM(
  model: Model<Api>,
  context: Context,
  options?: {
    tools?: ToolDefinition[];
    maxTokens?: number;
  }
): AsyncIterable<AssistantMessageEvent> {
  // Filter out empty messages before sending to API
  const filteredMessages = filterEmptyMessages(context.messages);

  const filteredContext: Context = {
    ...context,
    messages: filteredMessages,
  };

  const streamIterator = stream(model, {
    ...filteredContext,
    tools: convertTools(options?.tools),
  }, {
    maxTokens: options?.maxTokens,
  });

  for await (const event of streamIterator) {
    yield event;
  }
}
