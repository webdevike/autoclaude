import {
  query,
  type SDKMessage,
  type SDKAssistantMessage,
  type SDKResultMessage,
  type SDKResultSuccess,
  type SDKToolProgressMessage
} from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter } from 'events';

export type MessageType = 'text' | 'tool_use' | 'tool_result' | 'progress';

export interface ClaudeMessage {
  content: string;
  type: MessageType;
  timestamp: Date;
  toolName?: string;
}

export interface ClaudeControllerOptions {
  workingDir: string;
  maxTurns?: number;
}

interface ClaudeControllerEventMap {
  message: [content: string, type: MessageType, toolName?: string];
  progress: [summary: string];
  complete: [result: string, summary: string];
  error: [error: Error];
}

/**
 * ClaudeController manages Claude Code subprocess via the Agent SDK.
 * Streams progress for real-time UI updates and captures results for voice summarization.
 */
export class ClaudeController extends EventEmitter<ClaudeControllerEventMap> {
  private abortController: AbortController | null = null;
  private messages: ClaudeMessage[] = [];

  /**
   * Execute a prompt using Claude Code.
   * @param prompt - The development task to execute
   * @param options - Configuration options
   * @returns The final result text
   */
  async execute(prompt: string, options: ClaudeControllerOptions): Promise<string> {
    this.abortController = new AbortController();
    this.messages = [];
    let finalResult = '';

    try {
      const queryResult = query({
        prompt,
        options: {
          cwd: options.workingDir,
          maxTurns: options.maxTurns ?? 50,
          allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          abortController: this.abortController
        }
      });

      for await (const message of queryResult) {
        this.handleMessage(message);

        if (message.type === 'result') {
          const resultMessage = message as SDKResultMessage;
          if (resultMessage.subtype === 'success') {
            finalResult = (resultMessage as SDKResultSuccess).result;
          }
        }
      }

      const summary = this.summarizeResult(finalResult);
      this.emit('complete', finalResult, summary);
      return finalResult;
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        this.emit('error', error);
        throw error;
      }
      // AbortError is expected on cancellation
      return '';
    }
  }

  /**
   * Cancel the current execution.
   */
  cancel(): void {
    this.abortController?.abort();
  }

  /**
   * Get all messages from the current session.
   */
  getMessages(): ReadonlyArray<ClaudeMessage> {
    return this.messages;
  }

  private handleMessage(message: SDKMessage): void {
    switch (message.type) {
      case 'assistant':
        this.handleAssistantMessage(message);
        break;
      case 'tool_progress':
        this.handleToolProgress(message as SDKToolProgressMessage);
        break;
      case 'result':
        // Final result handled in execute()
        break;
      default:
        // Other message types (system, user, etc.) are informational
        break;
    }
  }

  private handleAssistantMessage(message: SDKAssistantMessage): void {
    const betaMessage = message.message;

    for (const block of betaMessage.content) {
      if (block.type === 'text') {
        this.recordAndEmit(block.text, 'text');
        this.emitProgress('Claude is responding...');
      } else if (block.type === 'tool_use') {
        const toolName = block.name;
        const inputStr = typeof block.input === 'string'
          ? block.input
          : JSON.stringify(block.input, null, 2);
        this.recordAndEmit(
          `Using ${toolName}: ${this.truncateContent(inputStr, 200)}`,
          'tool_use',
          toolName
        );
        this.emitProgress(`Using ${toolName}...`);
      }
    }
  }

  private handleToolProgress(message: SDKToolProgressMessage): void {
    const progressText = `${message.tool_name} running (${message.elapsed_time_seconds.toFixed(1)}s)...`;
    this.emitProgress(progressText);
  }

  private recordAndEmit(content: string, type: MessageType, toolName?: string): void {
    this.messages.push({
      content,
      type,
      timestamp: new Date(),
      toolName
    });
    this.emit('message', content, type, toolName);
  }

  private emitProgress(summary: string): void {
    this.emit('progress', summary);
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }
    return content.slice(0, maxLength) + '...';
  }

  /**
   * Summarize result for voice delivery.
   * Removes code blocks and formats for spoken output.
   */
  private summarizeResult(result: string): string {
    if (!result) {
      return 'Task completed.';
    }

    // Replace code blocks with spoken descriptions
    let summary = result.replace(
      /```[\w]*\n[\s\S]*?\n```/g,
      '[code block omitted]'
    );

    // Replace inline code with description
    summary = summary.replace(/`([^`]+)`/g, '$1');

    // Remove markdown formatting
    summary = summary.replace(/\*\*([^*]+)\*\*/g, '$1');
    summary = summary.replace(/\*([^*]+)\*/g, '$1');
    summary = summary.replace(/#{1,6}\s+/g, '');

    // Collapse multiple newlines
    summary = summary.replace(/\n{3,}/g, '\n\n');

    // Truncate for voice delivery (reasonable spoken length)
    const maxVoiceLength = 500;
    if (summary.length > maxVoiceLength) {
      // Find a good break point
      const truncated = summary.slice(0, maxVoiceLength);
      const lastSentence = truncated.lastIndexOf('.');
      if (lastSentence > maxVoiceLength * 0.5) {
        summary = truncated.slice(0, lastSentence + 1);
      } else {
        summary = truncated + '...';
      }
    }

    return summary.trim() || 'Task completed.';
  }
}

/**
 * Format result for voice output.
 * Exported utility function for external use.
 */
export function formatForVoice(text: string): string {
  if (!text) {
    return 'Task completed.';
  }

  // Replace code blocks with spoken descriptions
  let summary = text.replace(
    /```[\w]*\n[\s\S]*?\n```/g,
    '[code block omitted]'
  );

  // Replace inline code
  summary = summary.replace(/`([^`]+)`/g, '$1');

  // Remove markdown formatting
  summary = summary.replace(/\*\*([^*]+)\*\*/g, '$1');
  summary = summary.replace(/\*([^*]+)\*/g, '$1');
  summary = summary.replace(/#{1,6}\s+/g, '');

  // Collapse multiple newlines
  summary = summary.replace(/\n{3,}/g, '\n\n');

  // Truncate for voice delivery
  const maxVoiceLength = 500;
  if (summary.length > maxVoiceLength) {
    const truncated = summary.slice(0, maxVoiceLength);
    const lastSentence = truncated.lastIndexOf('.');
    if (lastSentence > maxVoiceLength * 0.5) {
      summary = truncated.slice(0, lastSentence + 1);
    } else {
      summary = truncated + '...';
    }
  }

  return summary.trim() || 'Task completed.';
}
