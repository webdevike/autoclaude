import { EventEmitter } from 'events';

export type State = 'idle' | 'listening' | 'processing' | 'executing' | 'speaking';

export interface StateContext {
  currentPrompt?: string;
  currentToolCall?: { name: string; args: unknown; callId: string };
  executionResult?: string;
  error?: Error;
}

const VALID_TRANSITIONS: Record<State, State[]> = {
  idle: ['listening'],
  listening: ['processing', 'idle'],
  processing: ['executing', 'speaking', 'idle'],
  executing: ['processing', 'speaking', 'idle'],
  speaking: ['idle', 'listening']
};

export interface StateMachineEvents {
  transition: [{ from: State; to: State; context: StateContext }];
  reset: [];
  idle: [StateContext];
  listening: [StateContext];
  processing: [StateContext];
  executing: [StateContext];
  speaking: [StateContext];
}

export class StateMachine extends EventEmitter<StateMachineEvents> {
  private _state: State = 'idle';
  private _context: StateContext = {};

  get state(): State {
    return this._state;
  }

  get context(): StateContext {
    return { ...this._context };
  }

  transition(to: State, contextUpdate?: Partial<StateContext>): boolean {
    if (!VALID_TRANSITIONS[this._state].includes(to)) {
      console.warn(`Invalid transition: ${this._state} -> ${to}`);
      return false;
    }

    const from = this._state;
    this._state = to;

    if (contextUpdate) {
      this._context = { ...this._context, ...contextUpdate };
    }

    this.emit('transition', { from, to, context: this._context });
    this.emit(to, this._context);

    return true;
  }

  reset(): void {
    this._state = 'idle';
    this._context = {};
    this.emit('reset');
  }
}
