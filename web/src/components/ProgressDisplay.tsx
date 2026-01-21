import { useEffect, useRef, useState } from 'react';
import type { WebSocketMessage } from '../hooks/useWebSocket';

interface ProgressItem {
  id: string;
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'audio';
  content: string;
  tool?: string;
  timestamp: Date;
}

interface ProgressDisplayProps {
  messages: WebSocketMessage[];
  onClear: () => void;
}

export function ProgressDisplay({ messages, onClear }: ProgressDisplayProps) {
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const processedCountRef = useRef(0);

  useEffect(() => {
    // Only process new messages
    const newMessages = messages.slice(processedCountRef.current);
    if (newMessages.length === 0) return;

    processedCountRef.current = messages.length;

    const newItems = newMessages.map((msg) => ({
      id: crypto.randomUUID(),
      type: msg.type,
      content: msg.content,
      tool: msg.tool,
      timestamp: new Date(),
    }));

    setItems((prev) => [...prev, ...newItems]);
  }, [messages]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [items, autoScroll]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  }

  function handleClear() {
    setItems([]);
    processedCountRef.current = 0;
    onClear();
  }

  return (
    <div className="progress-display-container">
      <div className="progress-header">
        <h2>Progress</h2>
        {items.length > 0 && (
          <button className="clear-button" onClick={handleClear}>
            Clear
          </button>
        )}
      </div>
      <div
        ref={containerRef}
        className="progress-display"
        onScroll={handleScroll}
      >
        {items.length === 0 ? (
          <div className="empty-state">No activity yet</div>
        ) : (
          items.map((item) => <ProgressItem key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}

function ProgressItem({ item }: { item: ProgressItem }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = item.content.length > 500;

  const displayContent = isLong && !expanded
    ? item.content.slice(0, 500) + '...'
    : item.content;

  return (
    <div className={`progress-item ${item.type}`}>
      {item.type === 'tool_use' && item.tool && (
        <div className="tool-header">
          <ToolIcon tool={item.tool} />
          <span className="tool-name">{item.tool}</span>
        </div>
      )}
      {item.type === 'error' && (
        <div className="tool-header error-header">
          <ErrorIcon />
          <span className="tool-name">Error</span>
        </div>
      )}
      <pre className="progress-content">{displayContent}</pre>
      {isLong && (
        <button className="expand-button" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
      <span className="timestamp">
        {item.timestamp.toLocaleTimeString()}
      </span>
    </div>
  );
}

function ToolIcon({ tool }: { tool: string }) {
  const icons: Record<string, string> = {
    Read: 'R',
    Edit: 'E',
    Write: 'W',
    Bash: '$',
    Glob: 'G',
    Grep: '?',
  };

  return (
    <span className="tool-icon">{icons[tool] || 'T'}</span>
  );
}

function ErrorIcon() {
  return (
    <svg
      className="error-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
