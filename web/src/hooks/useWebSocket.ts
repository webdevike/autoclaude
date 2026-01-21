import { useCallback, useEffect, useRef, useState } from 'react';

export interface WebSocketMessage {
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'audio';
  content: string;
  tool?: string;
}

interface UseWebSocketOptions {
  url?: string;
  reconnectInterval?: number;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  isProcessing: boolean;
  messages: WebSocketMessage[];
  sendMessage: (text: string) => void;
  sendAudio: (data: ArrayBuffer) => void;
  commitAudio: () => void;
  clearMessages: () => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    url = `ws://${window.location.hostname}:3000/ws`,
    reconnectInterval = 3000,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket connected');
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsProcessing(false);
      console.log('WebSocket disconnected');
      // Attempt to reconnect
      reconnectTimeoutRef.current = window.setTimeout(connect, reconnectInterval);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'processing_start') {
          setIsProcessing(true);
          return;
        }

        if (data.type === 'processing_end') {
          setIsProcessing(false);
          return;
        }

        const message: WebSocketMessage = {
          type: data.type || 'text',
          content: data.content || data.text || '',
          tool: data.tool,
        };

        setMessages(prev => [...prev, message]);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };
  }, [url, reconnectInterval]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', content: text }));
    }
  }, []);

  const sendAudio = useCallback((data: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Send binary audio data with a type prefix
      const typePrefix = new TextEncoder().encode('audio:');
      const combined = new Uint8Array(typePrefix.length + data.byteLength);
      combined.set(typePrefix, 0);
      combined.set(new Uint8Array(data), typePrefix.length);
      wsRef.current.send(combined);
    }
  }, []);

  const commitAudio = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'audio_commit' }));
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    isConnected,
    isProcessing,
    messages,
    sendMessage,
    sendAudio,
    commitAudio,
    clearMessages,
  };
}
