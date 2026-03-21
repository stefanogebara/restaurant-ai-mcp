import { useState, useCallback, useRef } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface UseSSEChatOptions {
  endpoint: string;
  onAction?: (action: string, data: unknown) => void;
}

export function useSSEChat({ endpoint, onAction }: UseSSEChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const idCounter = useRef(0);

  const genId = () => `msg-${++idCounter.current}-${Date.now()}`;

  const sendMessage = useCallback(async (
    text: string,
    extra?: Record<string, unknown>,
  ) => {
    if (isStreaming) return;

    // Add user message (skip for __init__)
    if (text !== '__init__') {
      setMessages(prev => [...prev, {
        id: genId(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      }]);
    }

    // Add empty assistant message placeholder
    const assistantId = genId();
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }]);

    setIsStreaming(true);

    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
      const response = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          message: text,
          session_id: sessionIdRef.current,
          ...extra,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`API error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(trimmed.slice(6));

            if (data.type === 'start' && data.session_id) {
              sessionIdRef.current = data.session_id;
            }

            if (data.type === 'token' && data.text) {
              accumulated += data.text;
              const text = accumulated;
              setMessages(prev =>
                prev.map(m => m.id === assistantId ? { ...m, content: text } : m)
              );
            }

            if (data.type === 'action') {
              onAction?.(data.action, data.context);
            }

            if (data.type === 'error') {
              const errorText = accumulated || data.error || 'Erro desconhecido';
              setMessages(prev =>
                prev.map(m => m.id === assistantId ? { ...m, content: errorText } : m)
              );
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }

      // Clean [CRIAR_DEMO] tag from displayed message
      setMessages(prev =>
        prev.map(m => m.id === assistantId
          ? { ...m, content: m.content.replace(/\[CRIAR_DEMO\]/g, '').trim() }
          : m
        )
      );

    } catch (err) {
      setMessages(prev =>
        prev.map(m => m.id === assistantId
          ? { ...m, content: 'Desculpe, houve um erro. Tente novamente.' }
          : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, [endpoint, isStreaming, onAction]);

  return { messages, isStreaming, sendMessage, sessionId: sessionIdRef.current };
}
