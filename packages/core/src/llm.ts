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

  constructor(
    private keys: {
      anthropic?: string;
      openai?: string;
    },
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

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const { provider } = parseModel(request.model.model);

    if (provider === "anthropic") {
      return this.chatAnthropic(request);
    } else if (provider === "openai") {
      return this.chatOpenAI(request);
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
}

function parseModel(modelString: string): {
  provider: string;
  model: string;
} {
  const parts = modelString.split("/");
  if (parts.length === 2) {
    return { provider: parts[0], model: parts[1] };
  }
  // Default to anthropic if no provider prefix
  return { provider: "anthropic", model: modelString };
}
