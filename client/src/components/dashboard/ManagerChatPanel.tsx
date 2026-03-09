import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';

/** Render simple markdown: bold, tables, bullets, line breaks */
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Table block: lines that start and end with |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      // Filter separator rows (---|)
      const rows = tableLines.filter(l => !l.match(/^\s*\|[\s\-|:]+\|\s*$/));
      elements.push(
        <table key={`t${i}`} className="text-xs border-collapse w-full my-1">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? 'font-semibold border-b border-current' : ''}>
                {row.split('|').filter((_, ci, arr) => ci > 0 && ci < arr.length - 1).map((cell, ci) => (
                  <td key={ci} className="px-1 py-0.5 border-r border-current/20 last:border-0">{cell.trim()}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }
    // Bullet list item
    if (line.match(/^\s*[-*]\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*[-*]\s+/)) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul${i}`} className="list-disc list-inside my-1 space-y-0.5">
          {items.map((item, ii) => <li key={ii}>{applyInline(item)}</li>)}
        </ul>
      );
      continue;
    }
    // Empty line → spacer
    if (line.trim() === '') {
      elements.push(<div key={`sp${i}`} className="h-1" />);
    } else {
      elements.push(<p key={`p${i}`}>{applyInline(line)}</p>);
    }
    i++;
  }
  return <>{elements}</>;
}

function applyInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

interface Message {
  role: 'manager' | 'assistant';
  content: string;
  created_at?: string;
}

interface UsageData {
  used: number;
  limit: number | null;
}

interface ManagerChatPanelProps {
  onClose: () => void;
}

export function ManagerChatPanel({ onClose }: ManagerChatPanelProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ history: Message[] }>({
    queryKey: ['manager-chat-history'],
    queryFn: () => api.get('/manager-chat').then((r) => r.data),
  });

  const { data: usageData } = useQuery<UsageData>({
    queryKey: ['manager-usage'],
    queryFn: () => api.get('/manager-usage').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const isQuotaExhausted =
    usageData?.limit !== null &&
    usageData?.limit !== undefined &&
    (usageData?.used ?? 0) >= (usageData?.limit ?? Infinity);

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
    if (!trimmed || sendMutation.isPending || isQuotaExhausted) return;
    setInput('');
    sendMutation.mutate(trimmed);
  };

  return (
    <div className="fixed bottom-20 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-96 h-[70vh] sm:h-[520px] max-h-[520px] bg-white rounded-2xl shadow-xl border border-border-gray flex flex-col z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-gray">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="font-semibold text-deep-charcoal text-sm">{t('dashboard.managerAssistant')}</span>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="text-muted-stone hover:text-deep-charcoal text-lg leading-none">&times;</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {isLoading && <p className="text-xs text-muted-stone text-center">Loading history...</p>}
        {messages.length === 0 && !isLoading && (
          <p className="text-xs text-muted-stone text-center mt-8">{t('dashboard.managerAssistantHint')}</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={'flex ' + (m.role === 'manager' ? 'justify-end' : 'justify-start')}>
            <div className={'max-w-[80%] rounded-xl px-3 py-2 text-sm break-words ' + (m.role === 'manager' ? 'bg-burgundy text-white' : 'bg-soft-gray text-deep-charcoal')}>
              {m.role === 'assistant' ? renderMarkdown(m.content) : m.content}
            </div>
          </div>
        ))}
        {sendMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-soft-gray rounded-xl px-3 py-2 text-sm text-muted-stone animate-pulse">{t('dashboard.thinking')}</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {sendMutation.isError && (
        <div className="px-4 py-2 text-xs text-red-500 bg-red-50 border-t border-red-100">
          Failed to send. Please try again.
        </div>
      )}

      {isQuotaExhausted && (
        <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-t border-amber-100 flex items-center justify-between">
          <span>{t('dashboard.limitReached')}</span>
          <a href="/subscription/manage" className="underline font-medium">Upgrade &rarr;</a>
        </div>
      )}

      <div className="flex gap-2 px-4 py-3 border-t border-border-gray">
        <input
          className="flex-1 min-w-0 rounded-lg border border-border-gray px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          placeholder={isQuotaExhausted ? t('dashboard.limitReachedUpgrade') : t('dashboard.managerInputPlaceholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={sendMutation.isPending || isQuotaExhausted}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || sendMutation.isPending || isQuotaExhausted}
          className="bg-burgundy hover:bg-burgundy-dark disabled:opacity-40 text-white rounded-lg px-3 py-2 text-sm font-medium flex-shrink-0"
        >
          Send
        </button>
      </div>
    </div>
  );
}
