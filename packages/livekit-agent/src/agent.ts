/**
 * Jarvis LiveKit Voice Agent
 *
 * Runs as a LiveKit Agent worker. When an iOS (or web) client joins a
 * LiveKit room, this agent joins the room and starts a voice conversation
 * powered by OpenAI Realtime, with access to all Jarvis tools.
 */

import {
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  voice,
  llm,
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

import { createIntegrations } from "@jarvis/core";

import { bridgeIntegrationTools, buildExaTool } from "./tools.js";

// Load env from project root
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
dotenv.config({ path: resolve(projectRoot, ".env") });
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });

// ---- Initialize Jarvis integrations ----

let jarvisToolCtx: llm.ToolContext = {};

async function initializeIntegrations(): Promise<void> {
  const registry = await createIntegrations();

  // Bridge integration tools into ToolContext
  jarvisToolCtx = bridgeIntegrationTools(registry.integrations);

  // Add Exa search if configured
  const exaTool = buildExaTool();
  if (exaTool) {
    jarvisToolCtx["exa_search"] = exaTool;
    console.log("[livekit-agent] Added exa_search tool");
  }

  const toolNames = Object.keys(jarvisToolCtx);
  console.log(
    `[livekit-agent] ${toolNames.length} tools available: ${toolNames.join(", ")}`,
  );
}

// ---- System prompt ----

const SYSTEM_PROMPT = `You are Jarvis, a personal AI assistant. You speak in a warm, concise manner.

You have access to tools for:
- Gmail: reading, listing, and sending emails
- Notion: searching pages and reading content
- Linear: managing issues and projects
- Exa: searching the web for current information

When the user asks you to do something that requires a tool, use it. Keep spoken responses concise — you're a voice assistant, not writing an essay. Use natural conversational language.

If you don't know something and it might be findable online, use exa_search.
If the user asks about emails, use gmail tools.
If the user asks about notes or documents, use notion tools.
If the user asks about tasks or issues, use linear tools.`;

// ---- Entry point ----

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Initialize integrations during prewarm so they're ready when rooms connect
    await initializeIntegrations();

    // Load VAD model for voice activity detection
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    const vad = ctx.proc.userData.vad! as silero.VAD;

    // Create the agent with tools passed via constructor
    const agent = new voice.Agent({
      instructions: SYSTEM_PROMPT,
      tools: jarvisToolCtx,
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

    // Connect to the room
    await ctx.connect();

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
