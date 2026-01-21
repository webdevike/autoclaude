/**
 * Voice Controller - Manages OpenAI Realtime WebSocket connection
 * for voice interactions and function calling.
 */

import { EventEmitter } from 'events';
import { OpenAIRealtimeWebSocket } from 'openai/beta/realtime/websocket';
import { VOICE_TOOLS, type ToolName } from './function-definitions.js';

const DEFAULT_MODEL = 'gpt-4o-realtime-preview-2024-12-17';
const DEFAULT_VOICE = 'cedar';
const SYSTEM_INSTRUCTIONS = `You are a helpful development assistant that helps users with their codebase.
You can investigate the codebase, plan changes, and execute implementations.
Be concise and clear in your responses. When users ask about code, use the investigate tool.
When they want to make changes, first plan, then execute.`;

export interface VoiceControllerConfig {
  model?: string;
  voice?: 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse' | 'cedar' | 'marin';
  instructions?: string;
}

export interface VoiceControllerEvents {
  audio: (data: string) => void; // Base64 encoded PCM16 audio
  transcript: (text: string, role: 'user' | 'assistant') => void;
  function_call: (name: ToolName, args: string, callId: string) => void;
  error: (error: Error) => void;
  connected: () => void;
  disconnected: () => void;
}

export declare interface VoiceController {
  on<E extends keyof VoiceControllerEvents>(
    event: E,
    listener: VoiceControllerEvents[E]
  ): this;
  off<E extends keyof VoiceControllerEvents>(
    event: E,
    listener: VoiceControllerEvents[E]
  ): this;
  emit<E extends keyof VoiceControllerEvents>(
    event: E,
    ...args: Parameters<VoiceControllerEvents[E]>
  ): boolean;
}

export class VoiceController extends EventEmitter {
  private rt: OpenAIRealtimeWebSocket | null = null;
  private config: Required<VoiceControllerConfig>;
  private isConnected = false;

  constructor(config: VoiceControllerConfig = {}) {
    super();
    this.config = {
      model: config.model ?? DEFAULT_MODEL,
      voice: config.voice ?? DEFAULT_VOICE,
      instructions: config.instructions ?? SYSTEM_INSTRUCTIONS,
    };
  }

  /**
   * Connect to OpenAI Realtime API.
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      throw new Error('Already connected');
    }

    this.rt = new OpenAIRealtimeWebSocket({
      model: this.config.model,
    });

    this.setupEventHandlers();

    // Wait for connection to be established
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 30000);

      this.rt!.socket.addEventListener('open', () => {
        clearTimeout(timeout);
        this.isConnected = true;
        this.configureSession();
        resolve();
      });

      this.rt!.socket.addEventListener('error', (event) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket error: ${event}`));
      });
    });

    this.emit('connected');
  }

  /**
   * Configure the session with instructions, voice, and tools.
   */
  private configureSession(): void {
    if (!this.rt) return;

    this.rt.send({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: this.config.instructions,
        voice: this.config.voice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        tools: VOICE_TOOLS.map((tool) => ({
          type: tool.type,
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      },
    });
  }

  /**
   * Set up event handlers for the Realtime WebSocket.
   */
  private setupEventHandlers(): void {
    if (!this.rt) return;

    // Handle audio output
    this.rt.on('response.audio.delta', (event) => {
      this.emit('audio', event.delta);
    });

    // Handle transcripts
    this.rt.on('conversation.item.input_audio_transcription.completed', (event) => {
      this.emit('transcript', event.transcript, 'user');
    });

    this.rt.on('response.audio_transcript.done', (event) => {
      this.emit('transcript', event.transcript, 'assistant');
    });

    // Handle function calls
    this.rt.on('response.output_item.done', (event) => {
      const item = event.item;
      if (item.type === 'function_call' && item.call_id && item.arguments) {
        this.emit(
          'function_call',
          item.name as ToolName,
          item.arguments,
          item.call_id
        );
      }
    });

    // Handle errors
    this.rt.on('error', (event) => {
      this.emit('error', new Error(`Realtime API error: ${JSON.stringify(event)}`));
    });

    // Handle socket close
    this.rt.socket.addEventListener('close', () => {
      this.isConnected = false;
      this.emit('disconnected');
    });
  }

  /**
   * Send audio data to OpenAI.
   * @param data Base64 encoded PCM16 audio data
   */
  sendAudio(data: string): void {
    if (!this.rt || !this.isConnected) {
      throw new Error('Not connected');
    }

    this.rt.send({
      type: 'input_audio_buffer.append',
      audio: data,
    });
  }

  /**
   * Commit the audio buffer to trigger processing.
   */
  commitAudio(): void {
    if (!this.rt || !this.isConnected) {
      throw new Error('Not connected');
    }

    this.rt.send({ type: 'input_audio_buffer.commit' });
  }

  /**
   * Clear the audio buffer.
   */
  clearAudio(): void {
    if (!this.rt || !this.isConnected) {
      throw new Error('Not connected');
    }

    this.rt.send({ type: 'input_audio_buffer.clear' });
  }

  /**
   * Send function call result back to OpenAI.
   */
  sendFunctionResult(callId: string, result: string): void {
    if (!this.rt || !this.isConnected) {
      throw new Error('Not connected');
    }

    this.rt.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: result,
      },
    });

    // Trigger a response after providing the function result
    this.rt.send({ type: 'response.create' });
  }

  /**
   * Interrupt the current response (e.g., when user starts speaking).
   */
  interrupt(): void {
    if (!this.rt || !this.isConnected) {
      throw new Error('Not connected');
    }

    this.rt.send({ type: 'response.cancel' });
  }

  /**
   * Disconnect from OpenAI Realtime API.
   */
  disconnect(): void {
    if (this.rt) {
      this.rt.socket.close();
      this.rt = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if connected.
   */
  get connected(): boolean {
    return this.isConnected;
  }
}
