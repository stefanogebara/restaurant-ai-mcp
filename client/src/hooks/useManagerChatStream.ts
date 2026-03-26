/**
 * useManagerChatStream — SSE streaming hook for Manager AI chat.
 *
 * Uses native fetch with ReadableStream (axios doesn't support streaming).
 * Falls back gracefully if SSE fails.
 */
import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface Message {
  role: 'manager' | 'assistant';
  content: string;
  created_at?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export function useManagerChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const qc = useQueryClient();

  const sendMessage = useCallback(async (message: string) => {
    setError(null);
    setIsStreaming(true);
    setStreamingContent('');

    // Optimistically add user message
    const previous = qc.getQueryData<{ history: Message[] }>(['manager-chat-history']);
    qc.setQueryData<{ history: Message[] }>(['manager-chat-history'], (old) => ({
      history: [...(old?.history || []), { role: 'manager', content: message }],
    }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const controller = new AbortController();
      abortRef.current = controller;

      const response = await fetch(`${API_BASE_URL}/manager-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6);
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'token') {
              accumulated += event.text;
              setStreamingContent(accumulated);
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
            // 'start' and 'done' are control events — no action needed for rendering
          } catch (parseErr) {
            // Skip malformed events
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }

      // Stream complete — rebuild from pre-mutation snapshot to avoid duplicates
      if (accumulated) {
        qc.setQueryData<{ history: Message[] }>(['manager-chat-history'], {
          history: [
            ...(previous?.history || []),
            { role: 'manager', content: message },
            { role: 'assistant', content: accumulated },
          ],
        });
      }

      // Optimistically increment usage counter
      qc.setQueryData(['manager-usage'], (old: Record<string, unknown> | undefined) =>
        old && typeof old === 'object' && 'used' in old
          ? { ...old, used: (old.used as number) + 1 }
          : old
      );
      qc.invalidateQueries({ queryKey: ['manager-usage'] });
      setStreamingContent('');
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled — keep the partial content if any
        return;
      }
      // Rollback optimistic update
      if (previous) {
        qc.setQueryData(['manager-chat-history'], previous);
      }
      setError((err as Error).message);
      setStreamingContent('');
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [qc]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { sendMessage, isStreaming, streamingContent, error, abort };
}
