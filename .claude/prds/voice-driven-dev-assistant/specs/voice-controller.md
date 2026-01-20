# Voice Controller

## Objective

Implement the Voice Controller module that manages the WebSocket connection to OpenAI's Realtime API, handling audio streaming and function calls.

Expected outcome:
- `VoiceController` class managing OpenAI Realtime connection
- Event-based interface for audio and function call handling
- Session configuration with Cedar/Marin voice

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: Express WebSocket server, State machine
- **Dependents**: Function definitions, Audio streaming

## Acceptance Criteria

- [ ] VoiceController connects to OpenAI Realtime WebSocket
- [ ] Session configured with instructions and voice selection
- [ ] Audio input forwarded to OpenAI
- [ ] Audio output events emitted for playback
- [ ] Function calls detected and emitted for handling
- [ ] Graceful disconnection and reconnection

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to create | `server/src/voice-controller.ts` |
| Key patterns | Use `openai` SDK's `OpenAIRealtimeWebSocket` |
| Technical constraints | PCM16 audio @ 24kHz |

### Example

```typescript
import { OpenAIRealtimeWebSocket } from 'openai/beta/realtime/websocket';
import { EventEmitter } from 'events';

interface VoiceControllerEvents {
  'audio': (data: ArrayBuffer) => void;
  'transcript': (text: string, role: 'user' | 'assistant') => void;
  'function_call': (name: string, args: unknown, callId: string) => void;
  'error': (error: Error) => void;
}

export class VoiceController extends EventEmitter {
  private rt: OpenAIRealtimeWebSocket | null = null;

  async connect(): Promise<void> {
    this.rt = new OpenAIRealtimeWebSocket({
      model: 'gpt-4o-realtime-preview-2024-12-17'
    });

    // Configure session
    this.rt.send({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: 'You are a helpful development assistant...',
        voice: 'cedar',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        tools: [] // Set by function definitions
      }
    });

    this.rt.on('response.audio.delta', (event) => {
      this.emit('audio', event.delta);
    });

    this.rt.on('response.output_item.done', (event) => {
      if (event.item.type === 'function_call') {
        this.emit('function_call', event.item.name, event.item.arguments, event.item.call_id);
      }
    });
  }

  sendAudio(data: ArrayBuffer): void {
    this.rt?.send({
      type: 'input_audio_buffer.append',
      audio: Buffer.from(data).toString('base64')
    });
  }

  commitAudio(): void {
    this.rt?.send({ type: 'input_audio_buffer.commit' });
  }

  sendFunctionResult(callId: string, result: string): void {
    this.rt?.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: result
      }
    });
    this.rt?.send({ type: 'response.create' });
  }
}
```

## Testing Requirements

- [ ] Unit test connection lifecycle
- [ ] Mock WebSocket for function call handling tests
- [ ] Integration test with real OpenAI API (manual)

## Out of Scope

- Browser-side audio recording (handled by web package)
- Function execution (handled by Claude Controller)
