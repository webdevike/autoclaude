import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { AgentOrchestrator, Message, StreamProgressEvent } from "@jarvis/core";
import { randomUUID } from "node:crypto";

export interface HttpApiConfig {
  orchestrator: AgentOrchestrator;
  port?: number;
  host?: string;
}

interface MessageRequestBody {
  sender: string;
  text: string;
  mode?: string;
}

interface MessageResponse {
  text: string;
  toolsUsed: string[];
}

interface ErrorResponse {
  error: string;
}

interface HealthResponse {
  status: string;
}

/**
 * Start the HTTP API server for the LiveKit agent to communicate with the gateway.
 *
 * This is an internal communication bridge between the LiveKit agent process
 * and the gateway process. The LiveKit agent POSTs text messages from iOS
 * to this endpoint and receives orchestrated responses (with tool names) back.
 *
 * @param config - Configuration for the HTTP API server
 */
export async function startHttpApi(config: HttpApiConfig): Promise<void> {
  const { orchestrator } = config;
  const port = config.port ?? 3457;
  const host = config.host ?? "127.0.0.1";

  const app = new Hono();

  // Health check endpoint - useful for LiveKit agent to verify gateway is up
  app.get("/health", (c) => {
    const response: HealthResponse = { status: "ok" };
    return c.json(response);
  });

  // Main message endpoint
  app.post("/api/message", async (c) => {
    try {
      const body = await c.req.json<MessageRequestBody>();

      // Validate required fields
      if (!body.sender || !body.text) {
        const error: ErrorResponse = { error: "Missing required fields: sender and text" };
        return c.json(error, 400);
      }

      // Construct the message object
      const msg: Message = {
        id: randomUUID(),
        channel: "http-api",
        sender: body.sender,
        text: body.text,
        timestamp: Date.now(),
        mode: body.mode || orchestrator.getActiveMode(),
      };

      // Collect tool names during execution
      const toolsUsed: string[] = [];
      const onProgress = (event: StreamProgressEvent) => {
        if (event.type === "tool_use" && event.toolName) {
          toolsUsed.push(event.toolName);
        }
      };

      // Process the message through the orchestrator
      const response = await orchestrator.handleMessage(msg, onProgress);

      // Return the response with collected tool names
      const result: MessageResponse = {
        text: response.text,
        toolsUsed,
      };

      return c.json(result, 200);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      const error: ErrorResponse = { error: errorMsg };
      return c.json(error, 500);
    }
  });

  // Start the server
  serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  console.log(`[http-api] Listening on http://${host}:${port}`);
}
