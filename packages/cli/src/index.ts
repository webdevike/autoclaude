#!/usr/bin/env node

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AgentOrchestrator,
  LLMClient,
  TmuxManager,
} from "@jarvis/core";
import type { ModeConfig, Integration } from "@jarvis/core";
import { Gateway } from "@jarvis/gateway";
import { TelegramChannel } from "@jarvis/channel-telegram";
import { SlackChannel } from "@jarvis/channel-slack";
import { NotionIntegration } from "@jarvis/integration-notion";
import { LinearIntegration } from "@jarvis/integration-linear";
import { GmailIntegration } from "@jarvis/integration-gmail";
import { Scheduler } from "@jarvis/scheduler";
import { StatusReporter } from "@jarvis/status-reporter";

async function main(): Promise<void> {
  console.log("Starting Jarvis...\n");

  // --- Load config ---
  const configDir = process.env.JARVIS_CONFIG_DIR ?? "./config";
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

  // --- Initialize core ---
  const llm = new LLMClient({
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  });

  const tmux = new TmuxManager();
  const orchestrator = new AgentOrchestrator(llm, tmux);

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

  if (
    process.env.SLACK_BOT_TOKEN &&
    process.env.SLACK_APP_TOKEN &&
    process.env.SLACK_SIGNING_SECRET
  ) {
    gateway.registerChannel(
      new SlackChannel(
        process.env.SLACK_BOT_TOKEN,
        process.env.SLACK_APP_TOKEN,
        process.env.SLACK_SIGNING_SECRET,
      ),
    );
  } else {
    console.warn("[channels] Slack credentials not set, Slack disabled.");
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

  // --- Start status reporter ---
  const activeMode = modes.find((m) => m.mode === defaultMode) ?? modes[0];
  const channels = Array.from(
    (gateway as unknown as { channels: Map<string, unknown> }).channels?.values() ?? [],
  );

  const reporter = new StatusReporter(orchestrator, tmux, {
    interval: activeMode.statusInterval ?? 300,
    channels: channels as import("@jarvis/core").Channel[],
    recipient: "broadcast",
  });
  reporter.start();

  // --- Start gateway ---
  await gateway.start();

  console.log(`\nJarvis is running in "${defaultMode}" mode.`);
  console.log("Press Ctrl+C to stop.\n");

  // --- Graceful shutdown ---
  const shutdown = async (): Promise<void> => {
    console.log("\nShutting down Jarvis...");
    reporter.stop();
    scheduler.shutdown();
    await gateway.shutdown();
    for (const integration of integrations) {
      await integration.shutdown();
    }
    tmux.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
