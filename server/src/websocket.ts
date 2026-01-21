import { WebSocket } from 'ws';
import { Orchestrator, type ClientMessage } from './orchestrator.js';

let orchestrator: Orchestrator | null = null;

/**
 * Set the orchestrator instance for WebSocket handlers to use.
 */
export function setOrchestrator(orch: Orchestrator): void {
  orchestrator = orch;
}

/**
 * Handle a new WebSocket connection.
 */
export function handleConnection(ws: WebSocket): void {
  console.log('Client connected');

  if (!orchestrator) {
    console.error('Orchestrator not initialized');
    ws.close(1011, 'Server not ready');
    return;
  }

  // Register client with orchestrator
  orchestrator.registerClient(ws);

  ws.on('message', (data) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      orchestrator!.handleClientMessage(ws, message);
    } catch (err) {
      sendError(ws, 'Invalid message format');
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
}

/**
 * Send error message to client.
 */
function sendError(ws: WebSocket, message: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'error', data: { message } }));
  }
}

/**
 * Get the orchestrator instance.
 */
export function getOrchestrator(): Orchestrator | null {
  return orchestrator;
}
