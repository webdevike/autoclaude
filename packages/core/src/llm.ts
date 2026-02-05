import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ModelConfig, ToolDefinition } from "./types.js";

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
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private openrouter: OpenAI | null = null;

  constructor(
    private keys: {
      anthropic?: string;
      openai?: string;
      openrouter?: string;
    },
    private fallbackProvider?: string,
  ) {}

  private getAnthropic(): Anthropic {
    if (!this.anthropic) {
      this.anthropic = new Anthropic({ apiKey: this.keys.anthropic });
    }
    return this.anthropic;
  }

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: this.keys.openai });
    }
    return this.openai;
  }

  private getOpenRouter(): OpenAI {
    if (!this.openrouter) {
      this.openrouter = new OpenAI({
        apiKey: this.keys.openrouter,
        baseURL: "https://openrouter.ai/api/v1",
      });
    }
    return this.openrouter;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const { provider } = parseModel(request.model.model);

    try {
      return await this.chatWithProvider(provider, request);
    } catch (err) {
      // If there's a fallback provider and it's different from what just failed, try it
      if (this.fallbackProvider && this.fallbackProvider !== provider) {
        const fallbackModel = `${this.fallbackProvider}/${parseModel(request.model.model).model}`;
        console.warn(
          `[llm] ${provider} failed, falling back to ${this.fallbackProvider}: ${err instanceof Error ? err.message : err}`,
        );
        const fallbackRequest = {
          ...request,
          model: { ...request.model, model: fallbackModel },
        };
        return this.chatWithProvider(this.fallbackProvider, fallbackRequest);
      }
      throw err;
    }
  }

  private async chatWithProvider(
    provider: string,
    request: LLMRequest,
  ): Promise<LLMResponse> {
    if (provider === "anthropic") {
      return this.chatAnthropic(request);
    } else if (provider === "openai") {
      return this.chatOpenAI(request);
    } else if (provider === "openrouter") {
      return this.chatOpenRouter(request);
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }

  private async chatAnthropic(request: LLMRequest): Promise<LLMResponse> {
    const client = this.getAnthropic();
    const { model } = parseModel(request.model.model);

    const tools = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool["input_schema"],
    }));

    const response = await client.messages.create({
      model,
      max_tokens: request.maxTokens ?? request.model.maxTokens,
      system: request.systemPrompt,
      messages: request.messages,
      ...(tools?.length ? { tools } : {}),
    });

    const textBlocks = response.content.filter((b) => b.type === "text");
    const toolBlocks = response.content.filter(
      (b) => b.type === "tool_use",
    ) as Anthropic.ToolUseBlock[];

    return {
      text: textBlocks.map((b) => ("text" in b ? b.text : "")).join(""),
      toolCalls: toolBlocks.map((b) => ({
        name: b.name,
        params: b.input as Record<string, unknown>,
      })),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  private async chatOpenAI(request: LLMRequest): Promise<LLMResponse> {
    const client = this.getOpenAI();
    const { model } = parseModel(request.model.model);

    const tools = request.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await client.chat.completions.create({
      model,
      max_tokens: request.maxTokens ?? request.model.maxTokens,
      messages: [
        { role: "system", content: request.systemPrompt },
        ...request.messages,
      ],
      ...(tools?.length ? { tools } : {}),
    });

    const choice = response.choices[0];
    const toolCalls = choice?.message?.tool_calls?.map((tc) => ({
      name: tc.function.name,
      params: JSON.parse(tc.function.arguments),
    }));

    return {
      text: choice?.message?.content ?? "",
      toolCalls,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  /**
   * OpenRouter uses the OpenAI-compatible API format.
   * Model names are passed through as-is (e.g. "anthropic/claude-3.5-sonnet")
   * since OpenRouter expects the full provider/model slug.
   */
  private async chatOpenRouter(request: LLMRequest): Promise<LLMResponse> {
    const client = this.getOpenRouter();
    const { model } = parseModel(request.model.model);

    const tools = request.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await client.chat.completions.create({
      model,
      max_tokens: request.maxTokens ?? request.model.maxTokens,
      messages: [
        { role: "system", content: request.systemPrompt },
        ...request.messages,
      ],
      ...(tools?.length ? { tools } : {}),
    });

    const choice = response.choices[0];
    const toolCalls = choice?.message?.tool_calls?.map((tc) => ({
      name: tc.function.name,
      params: JSON.parse(tc.function.arguments),
    }));

    return {
      text: choice?.message?.content ?? "",
      toolCalls,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}

function parseModel(modelString: string): {
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
