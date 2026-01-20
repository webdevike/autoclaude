# Progress Display

## Objective

Implement a React component that displays real-time streaming output from Claude Code, showing what the AI is doing as it works.

Expected outcome:
- `ProgressDisplay` component showing Claude Code activity
- Real-time streaming updates via WebSocket
- Visual distinction between text, tool usage, and results
- Auto-scroll to bottom with manual scroll override

## Context

- **Parent PRD**: voice-driven-dev-assistant
- **Dependencies**: React app scaffold
- **Dependents**: E2E Integration

## Acceptance Criteria

- [ ] Displays streaming text messages from Claude
- [ ] Shows tool usage (Read, Edit, Bash) with icons
- [ ] Shows tool results (collapsible for long output)
- [ ] Auto-scrolls to bottom during updates
- [ ] User can scroll up without being pulled back down
- [ ] Clear button to reset display

## Implementation Notes

| Aspect | Details |
|--------|---------|
| Files to create | `web/src/components/ProgressDisplay.tsx` |
| Key patterns | Virtual scrolling for performance |
| Technical constraints | Handle high-frequency updates efficiently |

### Example

```tsx
import { useEffect, useRef, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

interface ProgressItem {
  id: string;
  type: 'text' | 'tool_use' | 'tool_result';
  content: string;
  tool?: string;
  timestamp: Date;
}

export function ProgressDisplay() {
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const { messages } = useWebSocket();

  useEffect(() => {
    // Add new messages to items
    const newItems = messages.map(msg => ({
      id: crypto.randomUUID(),
      type: msg.type,
      content: msg.content,
      tool: msg.tool,
      timestamp: new Date()
    }));
    setItems(prev => [...prev, ...newItems]);
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

  return (
    <div
      ref={containerRef}
      className="progress-display"
      onScroll={handleScroll}
    >
      {items.map(item => (
        <ProgressItem key={item.id} item={item} />
      ))}
    </div>
  );
}

function ProgressItem({ item }: { item: ProgressItem }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = item.content.length > 500;

  return (
    <div className={`progress-item ${item.type}`}>
      {item.type === 'tool_use' && (
        <div className="tool-header">
          <ToolIcon tool={item.tool} />
          <span>{item.tool}</span>
        </div>
      )}
      <pre className={isLong && !expanded ? 'truncated' : ''}>
        {item.content}
      </pre>
      {isLong && (
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
```

## Testing Requirements

- [ ] Unit test auto-scroll behavior
- [ ] Test with rapid message updates
- [ ] Visual test for different message types

## Out of Scope

- Syntax highlighting for code (may add later)
- Search/filter functionality
- Export/copy functionality
