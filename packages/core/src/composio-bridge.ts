/**
 * Composio Bridge — provides a remote MCP server config via Composio's Tool Router.
 *
 * Uses composio.create(entityId) to get a session with an MCP endpoint.
 * The Claude Code SDK connects to this MCP URL directly — no manual
 * tool wrapping needed. Composio's Tool Router handles tool discovery,
 * connection management, and execution.
 *
 * Compatible with @composio/core 0.6.x.
 */

import { Composio } from "@composio/core";

const ENTITY_ID = "default";

export interface ComposioMcpConfig {
  type: "http";
  url: string;
  headers?: Record<string, string>;
}

let composioInstance: Composio | null = null;
let cachedMcpConfig: ComposioMcpConfig | null = null;

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
 * Get the Composio Tool Router MCP config.
 *
 * Creates a session for the entity and returns the full MCP config
 * (type, url, headers) that can be passed directly to the Claude Code SDK
 * as a remote MCP server.
 */
export async function getComposioMcpConfig(): Promise<ComposioMcpConfig | null> {
  if (cachedMcpConfig) return cachedMcpConfig;

  const composio = getComposio();

  try {
    const session = await composio.create(ENTITY_ID);
    cachedMcpConfig = {
      type: session.mcp.type as "http",
      url: session.mcp.url,
      headers: session.mcp.headers,
    };
    console.log(`[composio-bridge] Tool Router MCP URL ready for entity "${ENTITY_ID}"`);
    return cachedMcpConfig;
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
  cachedMcpConfig = null;
  composioInstance = null;
}
