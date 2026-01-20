# Function Definitions

## Objective

Define the function tools that the OpenAI Realtime API can call to trigger Claude Code operations.

Expected outcome:
- Tool definitions for investigate, plan, and execute operations
- TypeScript types for function arguments
- Handler routing to Claude Controller

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: Voice Controller, Claude Controller
- **Dependents**: Audio streaming

## Acceptance Criteria

- [ ] `investigate` tool defined - explore codebase, answer questions
- [ ] `plan` tool defined - create implementation plan
- [ ] `execute` tool defined - implement changes
- [ ] `get_status` tool defined - get current Claude Code status
- [ ] `cancel` tool defined - stop current operation
- [ ] All tools have proper JSON Schema definitions

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to create | `server/src/function-definitions.ts` |
| Key patterns | OpenAI function calling schema |
| Technical constraints | Must match OpenAI tool format |

### Example

```typescript
export const VOICE_TOOLS = [
  {
    type: 'function' as const,
    name: 'investigate',
    description: 'Explore the codebase to understand how something works or answer a question about the code. Use this before planning or executing changes.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to investigate or find out about the codebase'
        },
        scope: {
          type: 'string',
          description: 'Optional: specific files or directories to focus on',
        }
      },
      required: ['query']
    }
  },
  {
    type: 'function' as const,
    name: 'plan',
    description: 'Create a detailed implementation plan for a feature or change. Returns a structured plan with tasks.',
    parameters: {
      type: 'object',
      properties: {
        feature: {
          type: 'string',
          description: 'Description of the feature or change to plan'
        },
        constraints: {
          type: 'string',
          description: 'Optional: any constraints or requirements'
        }
      },
      required: ['feature']
    }
  },
  {
    type: 'function' as const,
    name: 'execute',
    description: 'Implement changes to the codebase. Use after investigating and/or planning.',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'What to implement or change'
        },
        approach: {
          type: 'string',
          description: 'Optional: specific approach or plan to follow'
        }
      },
      required: ['task']
    }
  },
  {
    type: 'function' as const,
    name: 'get_status',
    description: 'Get the current status of Claude Code - what it is doing right now.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    type: 'function' as const,
    name: 'cancel',
    description: 'Cancel the current Claude Code operation.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Optional: reason for cancellation'
        }
      },
      required: []
    }
  }
];

export type ToolName = typeof VOICE_TOOLS[number]['name'];

export interface InvestigateArgs {
  query: string;
  scope?: string;
}

export interface PlanArgs {
  feature: string;
  constraints?: string;
}

export interface ExecuteArgs {
  task: string;
  approach?: string;
}

export interface CancelArgs {
  reason?: string;
}
```

## Testing Requirements

- [ ] Validate schemas against OpenAI spec
- [ ] Test argument parsing for each tool

## Out of Scope

- Custom tools beyond the core five
- Tool-specific permissions
