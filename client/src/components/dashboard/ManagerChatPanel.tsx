import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';

interface Message {
  role: 'manager' | 'assistant';
  content: string;
  created_at?: string;
}

interface ManagerChatPanelProps {
  onClose: () => void;
}

export function ManagerChatPanel({ onClose }: ManagerChatPanelProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ history: Message[] }>({
    queryKey: ['manager-chat-history'],
    queryFn: () => api.get('/manager-chat').then((r) => r.data),
  });

  const messages: Message[] = data?.history || [];

  const sendMutation = useMutation({
    mutationFn: (message: string) =>
      api.post('/manager-chat', { message }).then((r) => r.data),
    onMutate: (message) => {
      const previous = qc.getQueryData<{ history: Message[] }>(['manager-chat-history']);
      qc.setQueryData<{ history: Message[] }>(['manager-chat-history'], (old) => ({
        history: [...(old?.history || []), { role: 'manager', content: message }],
      }));
      return { previous };
    },
    onError: (_err, _message, context) => {
      if (context?.previous) {
        qc.setQueryData(['manager-chat-history'], context.previous);
      }
    },
    onSuccess: ({ reply }) => {
      qc.setQueryData<{ history: Message[] }>(['manager-chat-history'], (old) => ({
        history: [...(old?.history || []), { role: 'assistant', content: reply }],
      }));
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending) return;
    setInput('');
    sendMutation.mutate(trimmed);
  };

  return (
    <div className="fixed bottom-20 right-6 w-96 h-[520px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="font-semibold text-gray-800 text-sm">AI Manager Assistant</span>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">x</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {isLoading && <p className="text-xs text-gray-400 text-center">Loading history...</p>}
        {messages.length === 0 && !isLoading && (
          <p className="text-xs text-gray-400 text-center mt-8">Ask anything about your restaurant - reservations, staff, trends.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={'flex ' + (m.role === 'manager' ? 'justify-end' : 'justify-start')}>
            <div className={'max-w-[80%] rounded-xl px-3 py-2 text-sm ' + (m.role === 'manager' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800')}>
              {m.content}
            </div>
          </div>
        ))}
        {sendMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-xl px-3 py-2 text-sm text-gray-400 animate-pulse">Thinking...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {sendMutation.isError && (
        <div className="px-4 py-2 text-xs text-red-500 bg-red-50 border-t border-red-100">
          Failed to send. Please try again.
        </div>
      )}

      <div className="flex gap-2 px-4 py-3 border-t border-gray-100">
        <input
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ask your AI assistant..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={sendMutation.isPending}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || sendMutation.isPending}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg px-3 py-2 text-sm font-medium"
        >
          Send
        </button>
      </div>
    </div>
  );
}
