/**
 * Shared integration registry.
 *
 * Single source of truth for initializing all Jarvis integrations.
 * Both the CLI (text channels) and the LiveKit agent (voice) import this.
 */

import type { Integration } from "./types.js";

export interface IntegrationRegistry {
  integrations: Integration[];
  /** Flat list of all tool names across all integrations */
  toolNames: string[];
}

/**
 * Create and initialize all provided integrations.
 *
 * Each caller passes in the integration constructors (to avoid circular deps
 * between core and integration packages). Use `allIntegrationImports()` to
 * get the standard set.
 */
export async function createIntegrations(
  constructors: Array<new () => Integration>,
): Promise<IntegrationRegistry> {
  const integrations: Integration[] = [];

  for (const Ctor of constructors) {
    try {
      const instance = new Ctor();
      await instance.initialize({});
      integrations.push(instance);
      console.log(`[integrations] Loaded: ${instance.name} (${instance.tools.length} tools)`);
    } catch (err) {
      console.warn(`[integrations] ${Ctor.name} unavailable: ${err instanceof Error ? err.message : err}`);
    }
  }

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
