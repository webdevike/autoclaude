import type { TObject } from '@sinclair/typebox';

export type ModelTier = "triage" | "smart";

export interface ModelConfig {
  provider: string;
  model: string;
  maxTokens: number;
}

export interface ModeConfig {
  mode: string;
  systemPrompt: string;
  tone?: string; // optional tone setting (e.g., "casual", "professional")
  provider?: "pi-ai" | "claude-code"; // LLM backend (default: "pi-ai")
  triage: ModelConfig;
  smart: ModelConfig;
  channels: string[];
  integrations: string[];
  statusInterval: number; // seconds between status updates, 0 = disabled
  crons: CronJobConfig[];
  cwd?: string; // working directory for tool execution (defaults to process.cwd())
  claudeCode?: {
    allowedTools?: string[]; // auto-approve these tools without prompting
    tools?: string[]; // limit available built-in tools (skips MCP loading if set)
    permissionMode?: "default" | "bypassPermissions" | "acceptEdits";
    maxTurns?: number; // limit agentic turns per request
  };
}

export type ScheduleType = "cron" | "at" | "every";

export interface CronJobConfig {
  name: string;
  scheduleType?: ScheduleType; // defaults to "cron" for backward compat
  schedule: string; // cron expression, ISO 8601 timestamp, or interval in ms
  prompt: string; // what to tell the agent to do
  tier: ModelTier; // which agent tier handles it
  mode: string; // which mode context to use
  replyTo?: {
    channel: string; // e.g. "telegram"
    chatId: string;  // e.g. "7912066552"
  };
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

export interface ToolDefinitionPiAi {
  name: string;
  description: string;
  parameters: TObject;  // TypeBox schema
  execute: (params: Record<string, unknown>) => Promise<string>;
}

export interface SessionEntry {
  timestamp: number;
  role: 'user' | 'assistant' | 'tool_result';
  content: string;
  toolName?: string;
  usage?: { inputTokens: number; outputTokens: number; model: string; cost: number };
}

export interface Integration {
  name: string;
  tools: ToolDefinition[];
  initialize: (config: Record<string, unknown>) => Promise<void>;
  shutdown: () => Promise<void>;
}

export interface InlineKeyboardButton { text: string; callback_data: string }
export interface InlineKeyboardMarkup { inline_keyboard: InlineKeyboardButton[][] }

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
  deleteMessage?: (recipient: string, messageId: string) => Promise<void>;
  sendWithKeyboard?: (recipient: string, text: string, keyboard: InlineKeyboardMarkup) => Promise<string | undefined>;
  onCallbackQuery?: (handler: (query: CallbackQuery) => Promise<void>) => void;
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

// Callback query from inline keyboards (Telegram)
export interface CallbackQuery {
  id: string;
  from: { id: number; username?: string };
  data?: string;
  message?: { message_id: number; chat: { id: number } };
}

// Autonomous task types
export type TaskStatus = "planning" | "awaiting_approval" | "running" | "paused" | "completed" | "cancelled" | "failed";

export interface TaskPhase {
  id: number;
  title: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface AutonomousTask {
  id: string;
  description: string;
  sender: string;
  chatId: string;
  channelName: string;
  mode: string;
  cwd: string;
  status: TaskStatus;
  phases: TaskPhase[];
  currentPhase: number;
  pendingQuestion?: { id: string; question: string; askedAt: number };
  planText?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
}
