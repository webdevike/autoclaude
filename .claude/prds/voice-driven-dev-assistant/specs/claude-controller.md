# Claude Controller

## Objective

Implement the Claude Controller module that spawns and manages Claude Code via the Agent SDK, streaming progress and capturing results.

Expected outcome:
- `ClaudeController` class managing Claude Code subprocess
- Streaming output for real-time progress updates
- Result capture for voice summarization

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: Express WebSocket server
- **Dependents**: Progress streaming, Result summarization

## Acceptance Criteria

- [ ] ClaudeController spawns Claude Code via Agent SDK
- [ ] Streaming messages emitted as they arrive
- [ ] Tool usage events captured (Read, Edit, Bash, etc.)
- [ ] Final result captured for summarization
- [ ] Cancellation supported via abort signal
- [ ] Working directory configurable

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to create | `server/src/claude-controller.ts` |
| Dependencies | `@anthropic-ai/claude-agent-sdk` |
| Key patterns | Use `query()` with streaming |
| Technical constraints | Auto-approve tools in V1 |

### Example

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter } from 'events';

interface ClaudeControllerEvents {
  'message': (content: string, type: 'text' | 'tool_use' | 'tool_result') => void;
  'progress': (summary: string) => void;
  'complete': (result: string) => void;
  'error': (error: Error) => void;
}

export class ClaudeController extends EventEmitter {
  private abortController: AbortController | null = null;

  async execute(prompt: string, workingDir: string): Promise<string> {
    this.abortController = new AbortController();
    let finalResult = '';

    try {
      for await (const message of query({
        prompt,
        options: {
          cwd: workingDir,
          maxTurns: 50,
          allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
          // Auto-approve in V1
          permissions: {
            allowAll: true
          }
        },
        signal: this.abortController.signal
      })) {
        switch (message.type) {
          case 'assistant':
            this.emit('message', message.content, 'text');
            break;
          case 'tool_use':
            this.emit('message', `Using ${message.tool}: ${message.input}`, 'tool_use');
            break;
          case 'tool_result':
            this.emit('message', message.result, 'tool_result');
            break;
          case 'result':
            finalResult = message.result;
            this.emit('complete', finalResult);
            break;
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        this.emit('error', error);
        throw error;
      }
    }

    return finalResult;
  }

  cancel(): void {
    this.abortController?.abort();
  }
}
```

## Testing Requirements

- [ ] Unit test with mocked Agent SDK
- [ ] Test cancellation behavior
- [ ] Integration test with real Claude Code (manual)

## Out of Scope

- Permission prompts (auto-approve in V1)
- Custom tool definitions
- Multi-session management
