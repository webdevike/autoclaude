/**
 * Orchestrator - Wires VoiceController, ClaudeController, and WebSocket together
 * for end-to-end voice-driven development assistant workflow.
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { VoiceController } from './voice-controller.js';
import { ClaudeController, formatForVoice } from './claude-controller.js';
import { StateMachine, type State, type StateContext } from './state-machine.js';
import {
  parseToolArgs,
  type ToolName,
  type InvestigateArgs,
  type PlanArgs,
  type ExecuteArgs,
} from './function-definitions.js';

export interface OrchestratorConfig {
  workingDir: string;
}

export interface ServerMessage {
  type: 'audio' | 'transcript' | 'progress' | 'state' | 'error';
  data: unknown;
}

export interface ClientMessage {
  type: 'audio' | 'audio_commit' | 'text' | 'cancel';
  data?: string;
}

interface OrchestratorEventMap {
  stateChange: [state: State, context: StateContext];
  error: [error: Error];
}

export class Orchestrator extends EventEmitter<OrchestratorEventMap> {
  private voiceController: VoiceController | null = null;
  private claudeController: ClaudeController;
  private stateMachine: StateMachine;
  private config: OrchestratorConfig;
  private connectedClients: Set<WebSocket> = new Set();
  private currentCallId: string | null = null;
  private latestProgress: string = '';

  constructor(config: OrchestratorConfig) {
    super();
    this.config = config;
    this.claudeController = new ClaudeController();
    this.stateMachine = new StateMachine();
    this.setupStateMachineEvents();
    this.setupClaudeEvents();
  }

  /**
   * Initialize the orchestrator (connect to OpenAI Realtime).
   */
  async initialize(): Promise<void> {
    this.voiceController = new VoiceController();
    this.setupVoiceEvents();

    try {
      await this.voiceController.connect();
      console.log('Voice controller connected to OpenAI Realtime');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('Failed to connect voice controller:', err);
      // Continue without voice - text fallback still works
      this.voiceController = null;
    }
  }

  /**
   * Register a WebSocket client connection.
   */
  registerClient(ws: WebSocket): void {
    this.connectedClients.add(ws);

    ws.on('close', () => {
      this.connectedClients.delete(ws);
    });

    // Send current state to new client
    this.send(ws, { type: 'state', data: { state: this.stateMachine.state } });
  }

  /**
   * Handle incoming client message.
   */
  handleClientMessage(ws: WebSocket, message: ClientMessage): void {
    switch (message.type) {
      case 'audio':
        this.handleAudioInput(message.data);
        break;
      case 'audio_commit':
        this.handleAudioCommit();
        break;
      case 'text':
        this.handleTextInput(message.data ?? '');
        break;
      case 'cancel':
        this.handleCancel();
        break;
    }
  }

  /**
   * Handle incoming audio data from client.
   */
  private handleAudioInput(audioData: string | undefined): void {
    if (!audioData || !this.voiceController?.connected) {
      return;
    }

    // Transition to listening if idle
    if (this.stateMachine.state === 'idle') {
      this.stateMachine.transition('listening');
      this.broadcastState();
    }

    // Forward audio to voice controller
    this.voiceController.sendAudio(audioData);
  }

  /**
   * Handle audio commit (user finished speaking).
   */
  private handleAudioCommit(): void {
    if (!this.voiceController?.connected) {
      return;
    }

    if (this.stateMachine.state === 'listening') {
      this.stateMachine.transition('processing');
      this.broadcastState();
    }

    this.voiceController.commitAudio();
  }

  /**
   * Handle text input (fallback when voice not available).
   */
  private async handleTextInput(text: string): Promise<void> {
    if (!text.trim()) {
      return;
    }

    if (this.stateMachine.state !== 'idle') {
      this.broadcastError('Please wait for the current operation to complete');
      return;
    }

    this.stateMachine.transition('listening', { currentPrompt: text });
    this.stateMachine.transition('processing');
    this.broadcastState();

    // Execute directly with Claude Code (no voice intermediary)
    await this.executeClaudeTask(text);
  }

  /**
   * Handle cancel request.
   */
  private handleCancel(): void {
    // Cancel Claude execution if running
    this.claudeController.cancel();

    // Interrupt voice if speaking
    if (this.voiceController?.connected) {
      try {
        this.voiceController.interrupt();
      } catch {
        // Ignore errors during interrupt
      }
    }

    // Reset state
    this.stateMachine.reset();
    this.currentCallId = null;
    this.broadcastState();
    this.broadcast({ type: 'progress', data: { message: 'Operation cancelled' } });
  }

  /**
   * Set up voice controller event handlers.
   */
  private setupVoiceEvents(): void {
    if (!this.voiceController) return;

    // Forward audio output to clients
    this.voiceController.on('audio', (audioData) => {
      if (this.stateMachine.state === 'speaking' || this.stateMachine.state === 'processing') {
        this.broadcast({ type: 'audio', data: { audio: audioData } });
      }
    });

    // Handle transcripts
    this.voiceController.on('transcript', (text, role) => {
      this.broadcast({
        type: 'transcript',
        data: { text, role },
      });

      if (role === 'user') {
        this.stateMachine.transition('processing', { currentPrompt: text });
        this.broadcastState();
      }
    });

    // Handle function calls from voice
    this.voiceController.on('function_call', (name, argsJson, callId) => {
      this.handleFunctionCall(name, argsJson, callId);
    });

    // Handle voice errors
    this.voiceController.on('error', (error) => {
      console.error('Voice controller error:', error);
      this.handleVoiceError(error);
    });

    // Handle disconnection
    this.voiceController.on('disconnected', () => {
      console.warn('Voice controller disconnected');
      this.broadcast({
        type: 'error',
        data: { message: 'Voice service disconnected. Using text fallback.' },
      });
    });
  }

  /**
   * Set up Claude controller event handlers.
   */
  private setupClaudeEvents(): void {
    this.claudeController.on('progress', (summary) => {
      this.latestProgress = summary;
      this.broadcast({ type: 'progress', data: { message: summary } });
    });

    this.claudeController.on('message', (content, type, toolName) => {
      // Forward Claude messages for UI display
      this.broadcast({
        type: 'progress',
        data: {
          message: toolName ? `${toolName}: ${content}` : content,
          type,
        },
      });
    });

    this.claudeController.on('error', (error) => {
      console.error('Claude controller error:', error);
      this.handleClaudeError(error);
    });

    this.claudeController.on('complete', (result, summary) => {
      this.handleClaudeComplete(result, summary);
    });
  }

  /**
   * Set up state machine event handlers.
   */
  private setupStateMachineEvents(): void {
    this.stateMachine.on('transition', ({ from, to, context }) => {
      console.log(`State: ${from} -> ${to}`);
      this.emit('stateChange', to, context);
    });

    this.stateMachine.on('reset', () => {
      this.broadcastState();
    });
  }

  /**
   * Handle function call from voice assistant.
   */
  private async handleFunctionCall(
    name: ToolName,
    argsJson: string,
    callId: string
  ): Promise<void> {
    this.currentCallId = callId;

    try {
      let result: string;

      switch (name) {
        case 'investigate':
          result = await this.handleInvestigate(argsJson);
          break;
        case 'plan':
          result = await this.handlePlan(argsJson);
          break;
        case 'execute':
          result = await this.handleExecute(argsJson);
          break;
        case 'get_status':
          result = this.handleGetStatus();
          break;
        case 'cancel':
          result = this.handleCancelTool();
          break;
        default:
          result = `Unknown tool: ${name}`;
      }

      // Send result back to voice controller
      if (this.voiceController?.connected && this.currentCallId === callId) {
        this.voiceController.sendFunctionResult(callId, result);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      if (this.voiceController?.connected && this.currentCallId === callId) {
        this.voiceController.sendFunctionResult(
          callId,
          `Error: ${errorMessage}`
        );
      }
    }
  }

  /**
   * Handle investigate function call.
   */
  private async handleInvestigate(argsJson: string): Promise<string> {
    const args = parseToolArgs('investigate', argsJson) as InvestigateArgs;

    this.stateMachine.transition('executing', {
      currentToolCall: { name: 'investigate', args, callId: this.currentCallId! },
    });
    this.broadcastState();

    const prompt = args.scope
      ? `Investigate: ${args.query}\nFocus on: ${args.scope}`
      : `Investigate: ${args.query}`;

    const result = await this.claudeController.execute(prompt, {
      workingDir: this.config.workingDir,
      maxTurns: 20,
    });

    return formatForVoice(result);
  }

  /**
   * Handle plan function call.
   */
  private async handlePlan(argsJson: string): Promise<string> {
    const args = parseToolArgs('plan', argsJson) as PlanArgs;

    this.stateMachine.transition('executing', {
      currentToolCall: { name: 'plan', args, callId: this.currentCallId! },
    });
    this.broadcastState();

    const prompt = args.constraints
      ? `Create a detailed implementation plan for: ${args.feature}\nConstraints: ${args.constraints}`
      : `Create a detailed implementation plan for: ${args.feature}`;

    const result = await this.claudeController.execute(prompt, {
      workingDir: this.config.workingDir,
      maxTurns: 30,
    });

    return formatForVoice(result);
  }

  /**
   * Handle execute function call.
   */
  private async handleExecute(argsJson: string): Promise<string> {
    const args = parseToolArgs('execute', argsJson) as ExecuteArgs;

    this.stateMachine.transition('executing', {
      currentToolCall: { name: 'execute', args, callId: this.currentCallId! },
    });
    this.broadcastState();

    const prompt = args.approach
      ? `${args.task}\n\nApproach: ${args.approach}`
      : args.task;

    const result = await this.claudeController.execute(prompt, {
      workingDir: this.config.workingDir,
      maxTurns: 50,
    });

    return formatForVoice(result);
  }

  /**
   * Handle get_status function call.
   */
  private handleGetStatus(): string {
    const state = this.stateMachine.state;
    const context = this.stateMachine.context;

    if (state === 'idle') {
      return 'I am currently idle and ready for a new task.';
    }

    if (state === 'executing' && context.currentToolCall) {
      return `Currently executing ${context.currentToolCall.name}. ${this.latestProgress}`;
    }

    return `Current state: ${state}. ${this.latestProgress || 'Processing...'}`;
  }

  /**
   * Handle cancel function call from voice.
   */
  private handleCancelTool(): string {
    this.claudeController.cancel();
    this.stateMachine.reset();
    this.broadcastState();
    return 'Operation cancelled.';
  }

  /**
   * Execute Claude task directly (for text input).
   */
  private async executeClaudeTask(prompt: string): Promise<void> {
    this.stateMachine.transition('executing');
    this.broadcastState();

    try {
      const result = await this.claudeController.execute(prompt, {
        workingDir: this.config.workingDir,
        maxTurns: 50,
      });

      const summary = formatForVoice(result);

      // Speak the result if voice is available
      if (this.voiceController?.connected) {
        this.speakText(summary);
      } else {
        // Text-only response
        this.broadcast({
          type: 'transcript',
          data: { text: summary, role: 'assistant' },
        });
        this.stateMachine.reset();
        this.broadcastState();
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleClaudeError(err);
    }
  }

  /**
   * Handle Claude completion.
   */
  private handleClaudeComplete(result: string, summary: string): void {
    // Store result in context
    this.stateMachine.transition('speaking', { executionResult: result });
    this.broadcastState();

    // The voice controller will handle speaking the summary
    // when it processes the function result
  }

  /**
   * Handle voice error.
   */
  private handleVoiceError(error: Error): void {
    const message = "I'm having trouble connecting to the voice service. Please try again or use text input.";

    this.broadcast({
      type: 'error',
      data: { message, details: error.message },
    });

    // Reset to idle for retry
    this.stateMachine.reset();
    this.broadcastState();
  }

  /**
   * Handle Claude error.
   */
  private handleClaudeError(error: Error): void {
    const brief = error.message.length > 100
      ? error.message.slice(0, 100) + '...'
      : error.message;
    const message = `Claude encountered an error: ${brief}`;

    this.broadcast({
      type: 'error',
      data: { message, details: error.message },
    });

    // Announce via voice if available
    if (this.voiceController?.connected && this.currentCallId) {
      this.voiceController.sendFunctionResult(
        this.currentCallId,
        `Error: ${brief}`
      );
    }

    // Store error and reset
    this.stateMachine.transition('idle', { error });
    this.broadcastState();
  }

  /**
   * Speak text via voice controller (for text input responses).
   */
  private speakText(text: string): void {
    // For text input responses, we need to inject the response
    // into the conversation. This creates a conversation item
    // and triggers a response.
    if (!this.voiceController?.connected) {
      return;
    }

    this.stateMachine.transition('speaking');
    this.broadcastState();

    // The response will be spoken through the audio event handler
    // For now, broadcast as transcript and reset
    this.broadcast({
      type: 'transcript',
      data: { text, role: 'assistant' },
    });

    // Reset after a brief delay to allow UI update
    setTimeout(() => {
      this.stateMachine.reset();
      this.broadcastState();
    }, 100);
  }

  /**
   * Broadcast state to all connected clients.
   */
  private broadcastState(): void {
    this.broadcast({
      type: 'state',
      data: { state: this.stateMachine.state },
    });
  }

  /**
   * Broadcast error to all connected clients.
   */
  private broadcastError(message: string): void {
    this.broadcast({
      type: 'error',
      data: { message },
    });
  }

  /**
   * Broadcast message to all connected clients.
   */
  private broadcast(message: ServerMessage): void {
    for (const client of this.connectedClients) {
      this.send(client, message);
    }
  }

  /**
   * Send message to specific client.
   */
  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Get current state.
   */
  get state(): State {
    return this.stateMachine.state;
  }

  /**
   * Get state machine (for testing/debugging).
   */
  getStateMachine(): StateMachine {
    return this.stateMachine;
  }

  /**
   * Check if voice is available.
   */
  get voiceAvailable(): boolean {
    return this.voiceController?.connected ?? false;
  }

  /**
   * Shutdown the orchestrator.
   */
  shutdown(): void {
    this.claudeController.cancel();
    this.voiceController?.disconnect();
    this.stateMachine.reset();
    this.connectedClients.clear();
  }
}
