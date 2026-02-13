/**
 * Types for the GSD (Get Shit Done) runner system.
 * Manages project lifecycle through Telegram bot commands.
 */

export type GsdStatus =
  | "idle"
  | "initializing"
  | "researching"
  | "planning"
  | "awaiting_plan_approval"
  | "executing"
  | "verifying"
  | "discussing"
  | "paused";

export interface GsdOperation {
  type: "init" | "progress" | "discuss" | "plan" | "execute" | "verify";
  phase?: number;
  startedAt: number;
}

export interface GsdProject {
  id: string;
  name: string;
  repoPath: string;
  sender: string;
  chatId: string;
  channelName: string;
  status: GsdStatus;
  currentOperation?: GsdOperation;
  sessionId?: string; // Claude Code session for multi-turn resume within one command
  createdAt: number;
  updatedAt: number;
}

export interface GsdState {
  activeProjectId?: string;
  projects: Record<string, GsdProject>;
}
