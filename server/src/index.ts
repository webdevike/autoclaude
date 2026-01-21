import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { handleConnection, setOrchestrator } from './websocket.js';
import { Orchestrator } from './orchestrator.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Determine working directory (default to current directory)
const workingDir = process.env.WORKING_DIR || process.cwd();

// Create and initialize the orchestrator
const orchestrator = new Orchestrator({ workingDir });

app.use(cors({ origin: ['http://localhost:5173'] }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    voiceAvailable: orchestrator.voiceAvailable,
    state: orchestrator.state,
  });
});

// API endpoint for text input (alternative to WebSocket)
app.post('/api/prompt', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Missing or invalid prompt' });
    return;
  }

  res.json({
    status: 'accepted',
    message: 'Use WebSocket for real-time updates',
  });
});

wss.on('connection', handleConnection);

async function start(): Promise<void> {
  // Set orchestrator for WebSocket handlers
  setOrchestrator(orchestrator);

  // Initialize orchestrator (connects to OpenAI Realtime)
  console.log('Initializing orchestrator...');
  await orchestrator.initialize();
  console.log(`Voice available: ${orchestrator.voiceAvailable}`);

  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Working directory: ${workingDir}`);
  });
}

// Graceful shutdown
function shutdown(): void {
  console.log('Shutting down...');
  orchestrator.shutdown();
  wss.clients.forEach((client) => client.close());
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the server
start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
