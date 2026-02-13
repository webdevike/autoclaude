#!/usr/bin/env node

import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
import {
  AgentOrchestrator,
  AutonomousRunner,
  WorkspaceManager,
  WorkspaceGit,
} from "@jarvis/core";
import type { ModeConfig } from "@jarvis/core";
import { Gateway, startHttpApi } from "@jarvis/gateway";
import { TelegramChannel } from "@jarvis/channel-telegram";
import { Scheduler } from "@jarvis/scheduler";

async function main(): Promise<void> {
  // Load .env from project root
  dotenv.config({ path: resolve(projectRoot, ".env") });

  console.log("Starting Jarvis...\n");

  // --- Load config ---
  const configDir = process.env.JARVIS_CONFIG_DIR ?? resolve(projectRoot, "config");
  const defaultMode = process.env.JARVIS_MODE ?? "personal";

  const modes: ModeConfig[] = [];
  for (const modeFile of ["personal.json", "work.json"]) {
    try {
      const raw = readFileSync(resolve(configDir, modeFile), "utf-8");
      modes.push(JSON.parse(raw) as ModeConfig);
    } catch {
      console.warn(`[config] Could not load ${modeFile}, skipping.`);
    }
  }

  if (modes.length === 0) {
    console.error("No mode configs found. Create config/personal.json or config/work.json");
    process.exit(1);
  }

  // --- Set API keys for pi-ai ---
  if (process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (process.env.OPENROUTER_API_KEY) process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

  // --- Initialize workspace ---
  const workspace = new WorkspaceManager();
  workspace.ensureWorkspace();

  // Initialize git for audit trail
  const workspaceGit = new WorkspaceGit(workspace.getWorkspaceDir());
  await workspaceGit.initRepo();

  // Commit initial SOUL.md if this is first run (git will handle if already committed)
  await workspaceGit.commitFile("SOUL.md", "Initial SOUL.md from workspace setup");

  // Migrate v1.0 data (idempotent, safe to run every startup)
  workspace.migrateV1Data();

  console.log(`[startup] Workspace ready at ${workspace.getWorkspaceDir()}`);

  // --- Initialize core ---
  const orchestrator = new AgentOrchestrator(configDir);

  // --- Initialize Composio Tool Router ---
  await orchestrator.initializeComposio();

  // --- Set up gateway ---
  const gateway = new Gateway(orchestrator, {
    modes,
    defaultMode,
  });

  // --- Register channels ---
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const telegramAllowed = process.env.TELEGRAM_ALLOWED_USERS?.split(",") ?? [];
    gateway.registerChannel(
      new TelegramChannel(process.env.TELEGRAM_BOT_TOKEN, telegramAllowed),
    );
  } else {
    console.warn("[channels] TELEGRAM_BOT_TOKEN not set, Telegram disabled.");
  }

  // --- Start scheduler ---
  const scheduler = new Scheduler(orchestrator);
  for (const mode of modes) {
    if (mode.crons?.length) {
      scheduler.loadFromConfigs(mode.crons);
    }
  }

  // Wire up live cron callbacks so autonomy tools can add/remove jobs at runtime
  orchestrator.setCronCallbacks({
    onAdded: (config) => scheduler.addJob(config),
    onRemoved: (name) => scheduler.removeJob(name),
  });

  // Wire up cron reply routing through the gateway
  scheduler.setSendReply((channel, chatId, text) => gateway.sendToChannel(channel, chatId, text));

  // Set default reply destination from allowed Telegram users (first user = owner)
  const defaultChatId = process.env.TELEGRAM_ALLOWED_USERS?.split(",")[0]?.trim();
  if (defaultChatId) {
    scheduler.setDefaultReplyTo("telegram", defaultChatId);
  }

  // Register scheduler tool so the agent can manage crons
  orchestrator.registerTool({
    name: "list_crons",
    description: "List all scheduled cron jobs",
    parameters: { type: "object", properties: {} },
    execute: async () => JSON.stringify(scheduler.listJobs()),
  });

  // Register modes after orchestrator is initialized
  for (const mode of modes) {
    orchestrator.registerMode(mode);
  }

  // Switch to default mode
  orchestrator.switchMode(defaultMode);

  // --- Start gateway ---
  await gateway.start();

  // --- Start HTTP API for LiveKit agent communication ---
  await startHttpApi({ orchestrator });

  // --- Set up autonomous runner ---
  const runner = new AutonomousRunner({
    sendMessage: (channelName, recipient, text) => gateway.sendToChannel(channelName, recipient, text),
    sendWithKeyboard: (channelName, recipient, text, keyboard) => gateway.sendWithKeyboard(channelName, recipient, text, keyboard),
    editMessageRemoveKeyboard: (channelName, recipient, messageId, text) => gateway.editMessageRemoveKeyboard(channelName, recipient, messageId, text),
  });
  orchestrator.setAutonomousRunner(runner);

  // Wire Telegram callback queries to the autonomous runner
  const telegramChannel = gateway.getChannel("telegram");
  if (telegramChannel?.onCallbackQuery) {
    telegramChannel.onCallbackQuery(async (query) => {
      await runner.handleCallbackQuery(query);
    });
    console.log("[startup] Telegram callback queries wired to autonomous runner.");
  }

  console.log(`\nJarvis is running in "${defaultMode}" mode.`);
  console.log("Press Ctrl+C to stop.\n");

  // --- Graceful shutdown ---
  const shutdown = async (): Promise<void> => {
    console.log("\nShutting down Jarvis...");
    scheduler.shutdown();
    await gateway.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
