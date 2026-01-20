# State Machine

## Objective

Implement a state machine to manage the conversation and execution flow, ensuring clear transitions between listening, processing, and speaking states.

Expected outcome:
- `StateMachine` class with well-defined states and transitions
- Event-driven state changes
- Guards to prevent invalid transitions
- State persistence for UI synchronization

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: None
- **Dependents**: Voice Controller, Claude Controller, Web UI

## Acceptance Criteria

- [ ] States: `idle`, `listening`, `processing`, `executing`, `speaking`
- [ ] Valid transitions enforced
- [ ] State change events emitted
- [ ] Current state queryable
- [ ] Context data preserved across transitions

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to create | `server/src/state-machine.ts` |
| Key patterns | Finite state machine with context |
| Technical constraints | Thread-safe for async operations |

### State Diagram

```
                    ┌──────────────┐
         ┌─────────│    idle      │◄────────┐
         │         └──────────────┘         │
         │                │                 │
         │ user starts    │ user starts     │
         │ speaking       │ typing          │
         │                ▼                 │
         │         ┌──────────────┐         │
         │         │  listening   │         │
         │         └──────────────┘         │
         │                │                 │
         │                │ audio committed │
         │                ▼                 │
         │         ┌──────────────┐         │
         │         │  processing  │────┐    │
         │         └──────────────┘    │    │
         │                │            │    │
         │ response       │ tool call  │    │
         │ ready          ▼            │    │
         │         ┌──────────────┐    │    │
         │         │  executing   │────┘    │
         │         └──────────────┘         │
         │                │                 │
         │                │ execution done  │
         │                ▼                 │
         │         ┌──────────────┐         │
         └────────►│   speaking   │─────────┘
                   └──────────────┘
                          │
                          │ audio done
                          ▼
                   (back to idle)
```

### Example

```typescript
import { EventEmitter } from 'events';

type State = 'idle' | 'listening' | 'processing' | 'executing' | 'speaking';

interface StateContext {
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

export class StateMachine extends EventEmitter {
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
```

## Testing Requirements

- [ ] Unit test all valid transitions
- [ ] Test invalid transition rejection
- [ ] Test context preservation
- [ ] Test event emission

## Out of Scope

- Persistent state storage
- State history/undo
- Parallel states
