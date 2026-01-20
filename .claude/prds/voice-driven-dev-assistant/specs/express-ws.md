# Express WebSocket Server

## Objective

Set up an Express server with WebSocket support for real-time communication between the browser client and the orchestrator.

Expected outcome:
- Express server running on configurable port
- WebSocket endpoint for client connections
- Message routing for audio, text, and progress updates
- Health check endpoint

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: Initialize workspace, Configure TypeScript
- **Dependents**: Voice Controller, Claude Controller, Web UI

## Acceptance Criteria

- [ ] Express server starts on PORT env var or 3001
- [ ] WebSocket upgrade at `/ws` endpoint
- [ ] Health check at `GET /health`
- [ ] CORS configured for localhost origins
- [ ] Graceful shutdown handling
- [ ] Client connection/disconnection logging

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to create | `server/src/index.ts`, `server/src/websocket.ts` |
| Dependencies | `express`, `ws`, `cors` |
| Key patterns | Singleton WebSocket server |
| Technical constraints | Single client connection in V1 |

### Example

```typescript
// server/src/index.ts
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { handleConnection } from './websocket';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors({ origin: ['http://localhost:5173'] }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

wss.on('connection', handleConnection);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  wss.clients.forEach(client => client.close());
  server.close(() => process.exit(0));
});
```

```typescript
// server/src/websocket.ts
import { WebSocket } from 'ws';

interface ClientMessage {
  type: 'audio' | 'audio_commit' | 'text' | 'cancel';
  data?: string; // base64 for audio, text for text
}

interface ServerMessage {
  type: 'audio' | 'transcript' | 'progress' | 'state' | 'error';
  data: unknown;
}

export function handleConnection(ws: WebSocket): void {
  console.log('Client connected');

  ws.on('message', (data) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      handleClientMessage(ws, message);
    } catch (err) {
      sendError(ws, 'Invalid message format');
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  // Send initial state
  send(ws, { type: 'state', data: { state: 'idle' } });
}

function handleClientMessage(ws: WebSocket, message: ClientMessage): void {
  switch (message.type) {
    case 'audio':
      // Forward to voice controller
      break;
    case 'audio_commit':
      // Commit audio buffer
      break;
    case 'text':
      // Handle text input
      break;
    case 'cancel':
      // Cancel current operation
      break;
  }
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, error: string): void {
  send(ws, { type: 'error', data: { message: error } });
}
```

## Testing Requirements

- [ ] Test server startup and health endpoint
- [ ] Test WebSocket connection lifecycle
- [ ] Test message routing

## Out of Scope

- Authentication (local-only in V1)
- Multiple simultaneous clients
- Rate limiting
