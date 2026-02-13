/**
 * Jarvis LiveKit Voice Agent
 *
 * Runs as a LiveKit Agent worker. When an iOS (or web) client joins a
 * LiveKit room, this agent joins the room and starts a voice conversation
 * powered by OpenAI Realtime, with access to all Jarvis tools via Composio.
 */

import {
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  voice,
} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import * as lkPlugins from "@livekit/agents-plugin-livekit";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import dotenv from "dotenv";
import { AccessToken } from "livekit-server-sdk";

// Note: Composio tools are handled at the gateway level (via MCP Tool Router).
// The livekit-agent delegates text to the gateway API and voice uses OpenAI Realtime directly.

// Load env from project root
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
dotenv.config({ path: resolve(projectRoot, ".env") });
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });

// ---- Gateway API config ----

const GATEWAY_API_URL = process.env.GATEWAY_API_URL || "http://127.0.0.1:3457";

// ---- System prompt ----

const SYSTEM_PROMPT = `You are Jarvis, a personal AI assistant. You speak in a warm, concise manner.

You have access to tools for:
- Gmail: reading, listing, and sending emails
- Notion: searching pages and reading content
- Linear: managing issues and projects
- GitHub: repository and issue management
- Google Calendar: event management
- Exa: searching the web for current information

When the user asks you to do something that requires a tool, use it. Keep spoken responses concise — you're a voice assistant, not writing an essay. Use natural conversational language.

If you don't know something and it might be findable online, use a search tool.
If the user asks about emails, use gmail tools.
If the user asks about notes or documents, use notion tools.
If the user asks about tasks or issues, use linear tools.`;

// ---- Gateway API client ----

let gatewayAvailable = false;

async function checkGatewayHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${GATEWAY_API_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json() as { status: string };
      return data.status === "ok";
    }
    return false;
  } catch {
    return false;
  }
}

async function routeTextToGateway(text: string, sender: string): Promise<{ text: string; toolsUsed: string[] }> {
  const res = await fetch(`${GATEWAY_API_URL}/api/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender, text }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gateway API error (${res.status}): ${err}`);
  }
  return res.json();
}

// ---- Entry point ----

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Load VAD model for voice activity detection
    proc.userData.vad = await silero.VAD.load();

    // Start background gateway health check (non-blocking)
    (async () => {
      for (let i = 0; i < 10; i++) {
        gatewayAvailable = await checkGatewayHealth();
        if (gatewayAvailable) {
          console.log("[livekit-agent] Gateway health check passed");
          break;
        }
        console.log(`[livekit-agent] Gateway not ready, retrying in 5s (${i + 1}/10)...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      if (!gatewayAvailable) {
        console.warn("[livekit-agent] Gateway not available after retries — will check on first message");
      }
    })();
  },

  entry: async (ctx: JobContext) => {
    const vad = ctx.proc.userData.vad! as silero.VAD;

    // Create the voice agent (tools are handled by gateway API for text messages)
    const agent = new voice.Agent({
      instructions: SYSTEM_PROMPT,
    });

    // Create agent session with OpenAI Realtime for low-latency voice
    const session = new voice.AgentSession({
      vad,
      llm: new openai.realtime.RealtimeModel({
        voice: "ash",
        model: "gpt-4o-realtime-preview",
      }),
      turnDetection: new lkPlugins.turnDetector.MultilingualModel(),
    });

    // Start the session
    await session.start({
      agent,
      room: ctx.room,
    });

    // Register voice tool execution forwarding
    session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, (event: voice.FunctionToolsExecutedEvent) => {
      try {
        // Pair function calls with their outputs
        const pairs = voice.zipFunctionCallsAndOutputs(event);

        // Build structured tool result objects
        const tools = pairs.map(([functionCall, functionCallOutput]) => {
          // Parse arguments safely
          let parsedArgs: unknown;
          try {
            parsedArgs = JSON.parse(functionCall.args);
          } catch {
            parsedArgs = functionCall.args; // fallback to raw string
          }

          return {
            name: functionCall.name,
            arguments: parsedArgs,
            result: functionCallOutput.output,
            isError: functionCallOutput.isError,
          };
        });

        // Forward to iOS via data channel
        const message = JSON.stringify({
          type: "function_tools_executed",
          tools,
        });

        ctx.room.localParticipant?.publishData(
          new TextEncoder().encode(message),
          { reliable: true }
        );

        const toolNames = tools.map(t => t.name).join(", ");
        console.log(`[livekit-agent] Voice tools forwarded to iOS: ${toolNames}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[livekit-agent] Voice tool forwarding error: ${msg}`);
        // Don't crash the agent if data channel publish fails
      }
    });

    console.log("[livekit-agent] Voice tool forwarding registered");

    // Connect to the room
    await ctx.connect();

    // Check gateway availability
    gatewayAvailable = await checkGatewayHealth();
    if (gatewayAvailable) {
      console.log("[livekit-agent] Gateway HTTP API is available — text routing active");
    } else {
      console.warn("[livekit-agent] Gateway HTTP API not reachable — text routing will retry on each message");
    }

    // Register data channel listener for text messages from iOS
    ctx.room.on("dataReceived", async (payload: Uint8Array, participant) => {
      // Only handle data from remote participants (iOS user), not from agent itself
      if (!participant) return;

      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);

        if (data.type !== "user_text" || !data.content) return;

        console.log(`[livekit-agent] Text from ${participant.identity}: ${data.content.slice(0, 100)}`);

        // Check gateway availability if previously unavailable
        if (!gatewayAvailable) {
          gatewayAvailable = await checkGatewayHealth();
          if (!gatewayAvailable) {
            // Send "not available" message to iOS
            const unavailableMsg = JSON.stringify({
              type: "agent_text_response",
              content: "Text processing is temporarily unavailable. Please try again in a moment.",
              timestamp: Date.now(),
              error: true,
            });
            await ctx.room.localParticipant?.publishData(
              new TextEncoder().encode(unavailableMsg),
              { reliable: true }
            );
            return;
          }
          console.log("[livekit-agent] Gateway HTTP API became available — text routing now active");
        }

        // Forward to gateway HTTP API
        const response = await routeTextToGateway(data.content, participant.identity);

        // Mark gateway as available after successful routing
        gatewayAvailable = true;

        // Send text response back to iOS via data channel
        const textResponse = JSON.stringify({
          type: "agent_text_response",
          content: response.text,
          timestamp: Date.now(),
        });
        await ctx.room.localParticipant?.publishData(
          new TextEncoder().encode(textResponse),
          { reliable: true }
        );

        // Send tool usage list if any tools were used
        if (response.toolsUsed.length > 0) {
          const toolsMsg = JSON.stringify({
            type: "function_tools_executed",
            tools: response.toolsUsed.map(name => ({ name })),
          });
          await ctx.room.localParticipant?.publishData(
            new TextEncoder().encode(toolsMsg),
            { reliable: true }
          );
        }

        console.log(`[livekit-agent] Text response sent (${response.text.length} chars, ${response.toolsUsed.length} tools)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[livekit-agent] Text routing error: ${msg}`);

        // Mark gateway as unavailable so next message retries health check
        gatewayAvailable = false;

        // Send error response back to iOS so it knows something went wrong
        try {
          const errorResponse = JSON.stringify({
            type: "agent_text_response",
            content: "Sorry, I encountered an error processing your message. Please try again.",
            timestamp: Date.now(),
            error: true,
          });
          await ctx.room.localParticipant?.publishData(
            new TextEncoder().encode(errorResponse),
            { reliable: true }
          );
        } catch {
          // If we can't even send the error, just log it
          console.error("[livekit-agent] Failed to send error response to iOS");
        }
      }
    });

    console.log("[livekit-agent] Data channel text handler registered");

    // Greet the user
    session.generateReply({
      instructions:
        "Greet the user briefly. Say something like 'Hey, what can I help with?'",
    });
  },
});

// ---- Token endpoint (Tailscale-only) ----

const TOKEN_PORT = parseInt(process.env.TOKEN_PORT || "3456", 10);

function startTokenServer() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !livekitUrl) {
    console.warn("[token-server] Missing LIVEKIT creds, skipping token server");
    return;
  }

  createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    if (req.method !== "POST" || req.url !== "/token") {
      res.writeHead(404).end("Not found");
      return;
    }

    const roomName = `jarvis-${randomBytes(4).toString("hex")}`;
    const identity = `ike-${randomBytes(3).toString("hex")}`;

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      ttl: "10m",
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ serverUrl: livekitUrl, participantToken: token, roomName }));
  }).on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[token-server] Port ${TOKEN_PORT} in use, skipping`);
    } else {
      console.error("[token-server] Error:", err.message);
    }
  }).listen(TOKEN_PORT, () => {
    console.log(`[token-server] Listening on :${TOKEN_PORT}`);
  });
}

// Run as CLI worker
if (process.env.VITEST === undefined) {
  const cmd = process.argv[2];
  if (cmd === "start" || cmd === "dev") {
    startTokenServer();
  }
  cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
}
