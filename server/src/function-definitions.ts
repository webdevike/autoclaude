/**
 * Function definitions for OpenAI Realtime API voice tools.
 * These tools allow the voice assistant to trigger Claude Code operations.
 */

export const VOICE_TOOLS = [
  {
    type: 'function' as const,
    name: 'investigate',
    description:
      'Explore the codebase to understand how something works or answer a question about the code. Use this before planning or executing changes.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to investigate or find out about the codebase',
        },
        scope: {
          type: 'string',
          description: 'Optional: specific files or directories to focus on',
        },
      },
      required: ['query'],
    },
  },
  {
    type: 'function' as const,
    name: 'plan',
    description:
      'Create a detailed implementation plan for a feature or change. Returns a structured plan with tasks.',
    parameters: {
      type: 'object',
      properties: {
        feature: {
          type: 'string',
          description: 'Description of the feature or change to plan',
        },
        constraints: {
          type: 'string',
          description: 'Optional: any constraints or requirements',
        },
      },
      required: ['feature'],
    },
  },
  {
    type: 'function' as const,
    name: 'execute',
    description:
      'Implement changes to the codebase. Use after investigating and/or planning.',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'What to implement or change',
        },
        approach: {
          type: 'string',
          description: 'Optional: specific approach or plan to follow',
        },
      },
      required: ['task'],
    },
  },
  {
    type: 'function' as const,
    name: 'get_status',
    description: 'Get the current status of Claude Code - what it is doing right now.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
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
          description: 'Optional: reason for cancellation',
        },
      },
      required: [],
    },
  },
] as const;

export type ToolName = (typeof VOICE_TOOLS)[number]['name'];

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

export interface GetStatusArgs {
  // No arguments
}

export interface CancelArgs {
  reason?: string;
}

export type ToolArgs = {
  investigate: InvestigateArgs;
  plan: PlanArgs;
  execute: ExecuteArgs;
  get_status: GetStatusArgs;
  cancel: CancelArgs;
};

/**
 * Parse function call arguments from JSON string.
 */
export function parseToolArgs<T extends ToolName>(
  name: T,
  argsJson: string
): ToolArgs[T] {
  try {
    return JSON.parse(argsJson) as ToolArgs[T];
  } catch {
    throw new Error(`Failed to parse arguments for tool "${name}": ${argsJson}`);
  }
}
