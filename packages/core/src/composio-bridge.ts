/**
 * Composio Bridge — provides a remote MCP server URL via Composio's Tool Router.
 *
 * Uses composio.create(entityId) to get a session with an MCP endpoint.
 * The Claude Code SDK connects to this MCP URL directly — no manual
 * tool wrapping needed. Composio's Tool Router handles tool discovery,
 * connection management, and execution.
 *
 * Compatible with @composio/core 0.6.x.
 */

import { Composio } from "@composio/core";

const ENTITY_ID = "jarvis";

let composioInstance: Composio | null = null;
let cachedMcpUrl: string | null = null;

/**
 * Get or create the Composio client singleton.
 */
function getComposio(): Composio {
  if (!composioInstance) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) {
      throw new Error("COMPOSIO_API_KEY environment variable is required");
    }
    composioInstance = new Composio({ apiKey });
  }
  return composioInstance;
}

/**
 * Get the Composio Tool Router MCP URL.
 *
 * Creates a session for the entity and returns the MCP endpoint URL
 * that can be passed directly to the Claude Code SDK as a remote MCP server.
 */
export async function getComposioMcpUrl(): Promise<string | null> {
  if (cachedMcpUrl) return cachedMcpUrl;

  const composio = getComposio();

  try {
    const session = await composio.create(ENTITY_ID);
    cachedMcpUrl = session.mcp.url;
    console.log(`[composio-bridge] Tool Router MCP URL ready for entity "${ENTITY_ID}"`);
    return cachedMcpUrl;
  } catch (err) {
    console.error(
      `[composio-bridge] Failed to create session: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

/**
 * Invalidate the cached session (used by /tools command to refresh).
 */
export function invalidateComposioCache(): void {
  cachedMcpUrl = null;
  composioInstance = null;
}
