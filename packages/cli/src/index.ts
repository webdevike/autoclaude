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

  // --- Register Telegram channels ---
  // Supports per-mode tokens: TELEGRAM_BOT_TOKEN_PERSONAL, TELEGRAM_BOT_TOKEN_WORK
  // Falls back to shared TELEGRAM_BOT_TOKEN for backward compatibility
  const telegramAllowed = process.env.TELEGRAM_ALLOWED_USERS?.split(",") ?? [];
  const registeredTokens = new Set<string>();

  for (const mode of modes) {
    if (!mode.channels.some(ch => ch === "telegram" || ch.startsWith("telegram-"))) continue;

    const modeTokenKey = `TELEGRAM_BOT_TOKEN_${mode.mode.toUpperCase()}`;
    const token = process.env[modeTokenKey] || process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      console.warn(`[channels] No Telegram token for mode '${mode.mode}' (checked ${modeTokenKey} and TELEGRAM_BOT_TOKEN), skipping.`);
      continue;
    }

    // Don't register the same token twice (shared token = single bot)
    if (registeredTokens.has(token)) continue;
    registeredTokens.add(token);

    // Use mode-specific channel name when a dedicated token is provided
    const hasDedicatedToken = !!process.env[modeTokenKey];
    const channelName = hasDedicatedToken ? `telegram-${mode.mode}` : "telegram";

    // Update mode config to reference the correct channel name
    if (hasDedicatedToken) {
      mode.channels = mode.channels.map(ch => ch === "telegram" ? channelName : ch);
    }

    gateway.registerChannel(
      new TelegramChannel(token, telegramAllowed, channelName),
    );
    console.log(`[channels] Registered Telegram channel '${channelName}' for mode '${mode.mode}'`);
  }

  if (registeredTokens.size === 0) {
    console.warn("[channels] No TELEGRAM_BOT_TOKEN set, Telegram disabled.");
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
  // Use whichever telegram channel name was registered (shared or per-mode)
  const defaultChatId = process.env.TELEGRAM_ALLOWED_USERS?.split(",")[0]?.trim();
  if (defaultChatId) {
    const defaultTelegramChannel = gateway.getChannel("telegram")
      ? "telegram"
      : gateway.getChannel(`telegram-${defaultMode}`)
        ? `telegram-${defaultMode}`
        : "telegram";
    scheduler.setDefaultReplyTo(defaultTelegramChannel, defaultChatId);
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
  // Check all possible telegram channel names (shared "telegram" or per-mode "telegram-*")
  for (const channelName of ["telegram", ...modes.map(m => `telegram-${m.mode}`)]) {
    const ch = gateway.getChannel(channelName);
    if (ch?.onCallbackQuery) {
      ch.onCallbackQuery(async (query) => {
        await runner.handleCallbackQuery(query);
      });
      console.log(`[startup] Callback queries wired for channel '${channelName}'.`);
    }
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
