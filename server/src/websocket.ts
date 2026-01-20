import { WebSocket } from 'ws';
import { StateMachine } from './state-machine.js';

export interface ClientMessage {
  type: 'audio' | 'audio_commit' | 'text' | 'cancel';
  data?: string; // base64 for audio, text for text
}

export interface ServerMessage {
  type: 'audio' | 'transcript' | 'progress' | 'state' | 'error';
  data: unknown;
}

const stateMachine = new StateMachine();

stateMachine.on('transition', ({ from, to, context }) => {
  console.log(`State transition: ${from} -> ${to}`);
});

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
    stateMachine.reset();
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });

  // Send initial state
  send(ws, { type: 'state', data: { state: stateMachine.state } });
}

function handleClientMessage(ws: WebSocket, message: ClientMessage): void {
  switch (message.type) {
    case 'audio':
      // Forward to voice controller (to be implemented)
      if (stateMachine.state === 'idle') {
        stateMachine.transition('listening');
        send(ws, { type: 'state', data: { state: 'listening' } });
      }
      break;
    case 'audio_commit':
      // Commit audio buffer and start processing
      if (stateMachine.state === 'listening') {
        stateMachine.transition('processing');
        send(ws, { type: 'state', data: { state: 'processing' } });
      }
      break;
    case 'text':
      // Handle text input
      if (stateMachine.state === 'idle') {
        stateMachine.transition('listening', { currentPrompt: message.data });
        stateMachine.transition('processing');
        send(ws, { type: 'state', data: { state: 'processing' } });
      }
      break;
    case 'cancel':
      // Cancel current operation and reset to idle
      stateMachine.reset();
      send(ws, { type: 'state', data: { state: 'idle' } });
      break;
  }
}

export function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function sendError(ws: WebSocket, error: string): void {
  send(ws, { type: 'error', data: { message: error } });
}

export function getStateMachine(): StateMachine {
  return stateMachine;
}
