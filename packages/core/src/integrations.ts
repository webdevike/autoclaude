/**
 * Shared integration registry.
 *
 * Single source of truth for which integrations Jarvis has.
 * Both the CLI (text channels) and the LiveKit agent (voice) import this
 * so adding a new integration automatically makes it available everywhere.
 */

import type { Integration } from "./types.js";

export interface IntegrationRegistry {
  integrations: Integration[];
  /** Flat list of all tool names across all integrations */
  toolNames: string[];
}

/**
 * Create and initialize all Jarvis integrations.
 *
 * Dynamically imports each integration package so this module doesn't
 * hard-depend on them at the type level (they depend on @jarvis/core,
 * so a static import from core → integration would be circular).
 */
export async function createIntegrations(): Promise<IntegrationRegistry> {
  const integrations: Integration[] = [];

  // Notion
  try {
    const { NotionIntegration } = await import("@jarvis/integration-notion");
    const notion = new NotionIntegration();
    await notion.initialize({});
    integrations.push(notion);
    console.log(`[integrations] Loaded: notion (${notion.tools.length} tools)`);
  } catch (err) {
    console.warn(`[integrations] Notion unavailable: ${err instanceof Error ? err.message : err}`);
  }

  // Linear
  try {
    const { LinearIntegration } = await import("@jarvis/integration-linear");
    const linear = new LinearIntegration();
    await linear.initialize({});
    integrations.push(linear);
    console.log(`[integrations] Loaded: linear (${linear.tools.length} tools)`);
  } catch (err) {
    console.warn(`[integrations] Linear unavailable: ${err instanceof Error ? err.message : err}`);
  }

  // Gmail
  try {
    const { GmailIntegration } = await import("@jarvis/integration-gmail");
    const gmail = new GmailIntegration();
    await gmail.initialize({});
    integrations.push(gmail);
    console.log(`[integrations] Loaded: gmail (${gmail.tools.length} tools)`);
  } catch (err) {
    console.warn(`[integrations] Gmail unavailable: ${err instanceof Error ? err.message : err}`);
  }

  // ---- Add new integrations here ----
  // They'll automatically be available in Telegram, voice, and any other channel.

  const toolNames = integrations.flatMap(i => i.tools.map(t => t.name));
  console.log(`[integrations] ${integrations.length} integrations, ${toolNames.length} tools: ${toolNames.join(", ")}`);

  return { integrations, toolNames };
}

/**
 * Shutdown all integrations gracefully.
 */
export async function shutdownIntegrations(registry: IntegrationRegistry): Promise<void> {
  for (const integration of registry.integrations) {
    await integration.shutdown();
  }
}
