export type ModelTier = "triage" | "smart";

export interface ModelConfig {
  provider: string;
  model: string;
  maxTokens: number;
}

export interface ModeConfig {
  mode: string;
  systemPrompt: string;
  triage: ModelConfig;
  smart: ModelConfig;
  channels: string[];
  integrations: string[];
  statusInterval: number; // seconds between status updates, 0 = disabled
  crons: CronJobConfig[];
}

export interface CronJobConfig {
  name: string;
  schedule: string; // cron expression
  prompt: string; // what to tell the agent to do
  tier: ModelTier; // which agent tier handles it
  mode: string; // which mode context to use
}

export interface Message {
  id: string;
  channel: string;
  channelMessageId?: string;
  sender: string;
  text: string;
  timestamp: number;
  mode: string;
  metadata?: Record<string, unknown>;
}

export interface AgentResponse {
  text: string;
  metadata?: Record<string, unknown>;
}

export interface AgentSession {
  id: string;
  tier: ModelTier;
  mode: string;
  tmuxWindow?: string;
  startedAt: number;
  status: "running" | "completed" | "failed";
  lastUpdate?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<string>;
}

export interface Integration {
  name: string;
  tools: ToolDefinition[];
  initialize: (config: Record<string, unknown>) => Promise<void>;
  shutdown: () => Promise<void>;
}

export interface Channel {
  name: string;
  initialize: (
    config: Record<string, unknown>,
    onMessage: (msg: Message) => Promise<void>,
  ) => Promise<void>;
  send: (recipient: string, text: string) => Promise<void>;
  sendTyping?: (recipient: string) => Promise<void>;
  sendPlaceholder?: (recipient: string, text: string) => Promise<string | undefined>;
  editMessage?: (recipient: string, messageId: string, text: string) => Promise<void>;
  shutdown: () => Promise<void>;
}

export interface DelegationRequest {
  sessionId: string;
  prompt: string;
  mode: string;
  tools: string[];
  onUpdate?: (update: string) => void;
}

export interface StatusUpdate {
  sessionId: string;
  summary: string;
  progress?: number; // 0-100
  timestamp: number;
}

export interface StreamProgressEvent {
  type: 'text_delta' | 'tool_use' | 'status' | 'done';
  text?: string;       // accumulated text so far (for text_delta)
  delta?: string;      // new text chunk (for text_delta)
  toolName?: string;   // tool being used (for tool_use)
  finalText?: string;  // complete response (for done)
}
