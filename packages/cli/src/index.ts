#!/usr/bin/env node

import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
import {
  AgentOrchestrator,
} from "@jarvis/core";
import type { ModeConfig, Integration } from "@jarvis/core";
import { Gateway } from "@jarvis/gateway";
import { TelegramChannel } from "@jarvis/channel-telegram";

import { NotionIntegration } from "@jarvis/integration-notion";
import { LinearIntegration } from "@jarvis/integration-linear";
import { GmailIntegration } from "@jarvis/integration-gmail";
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

  // --- Initialize core ---
  const orchestrator = new AgentOrchestrator();

  // --- Initialize integrations ---
  const integrations: Integration[] = [
    new NotionIntegration(),
    new LinearIntegration(),
    new GmailIntegration(),
  ];

  for (const integration of integrations) {
    await integration.initialize({});
    // Register integration tools with the orchestrator
    for (const tool of integration.tools) {
      orchestrator.registerTool(tool);
    }
  }

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

  console.log(`\nJarvis is running in "${defaultMode}" mode.`);
  console.log("Press Ctrl+C to stop.\n");

  // --- Graceful shutdown ---
  const shutdown = async (): Promise<void> => {
    console.log("\nShutting down Jarvis...");
    scheduler.shutdown();
    await gateway.shutdown();
    for (const integration of integrations) {
      await integration.shutdown();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
