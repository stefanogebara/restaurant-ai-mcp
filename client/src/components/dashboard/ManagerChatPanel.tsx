import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { renderMarkdown } from '../../utils/markdownRenderer';

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

  // Same split as ManagerAIChatPage: limit === 0 = feature not on plan,
  // anything > 0 with used >= limit = actual quota exhaustion.
  const isFeatureUnavailable =
    usageData?.limit !== null &&
    usageData?.limit !== undefined &&
    usageData.limit === 0;
  const isQuotaExhausted =
    !isFeatureUnavailable &&
    usageData?.limit !== null &&
    usageData?.limit !== undefined &&
    (usageData?.used ?? 0) >= (usageData?.limit ?? Infinity);
  const isInputBlocked = isFeatureUnavailable || isQuotaExhausted;

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
    onSuccess: ({ reply }, sentMessage, context) => {
      // Rebuild from the pre-mutation snapshot to avoid duplicates caused by
      // a concurrent query refetch that already contains the DB-persisted turns.
      const base = context?.previous?.history || [];
      qc.setQueryData<{ history: Message[] }>(['manager-chat-history'], {
        history: [
          ...base,
          { role: 'manager', content: sentMessage },
          { role: 'assistant', content: reply },
        ],
      });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending || isInputBlocked) return;
    setInput('');
    sendMutation.mutate(trimmed);
  };

  return (
    <div className="fixed bottom-20 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-96 h-[70vh] sm:h-[520px] max-h-[520px] glass-modal flex flex-col z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-gray">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="font-semibold text-deep-charcoal text-sm">{t('dashboard.managerAssistant')}</span>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="text-muted-stone hover:text-deep-charcoal text-lg leading-none">&times;</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {isLoading && <p className="text-xs text-muted-stone text-center">{t('managerAI.loadingHistory')}</p>}
        {messages.length === 0 && !isLoading && (
          <p className="text-xs text-muted-stone text-center mt-8">{t('dashboard.managerAssistantHint')}</p>
        )}
        {messages.map((m, i) => (
          // Use `created_at` as the stable identity. Falling back to the index
          // with a tag distinguishes optimistic-but-unpersisted messages from
          // saved ones so React doesn't reuse the wrong DOM node mid-stream.
          <div key={m.created_at ?? `opt-${i}`} className={'flex ' + (m.role === 'manager' ? 'justify-end' : 'justify-start')}>
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
          {t('manager.sendFailed', 'Failed to send. Please try again.')}
        </div>
      )}

      {(isFeatureUnavailable || isQuotaExhausted) && (
        <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-t border-amber-100 flex items-center justify-between">
          <span>
            {isFeatureUnavailable
              ? t('dashboard.featureNotIncluded', 'Manager AI is not included on your current plan')
              : t('dashboard.limitReached')}
          </span>
          <a href="/subscription/manage" className="underline font-medium">Upgrade &rarr;</a>
        </div>
      )}

      <div className="flex gap-2 px-4 py-3 border-t border-border-gray">
        <input
          className="flex-1 min-w-0 rounded-lg border border-border-gray px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
          placeholder={
            isFeatureUnavailable
              ? t('dashboard.featureUpgradePlaceholder', 'Upgrade your plan to chat with Manager AI')
              : isQuotaExhausted
              ? t('dashboard.limitReachedUpgrade')
              : t('dashboard.managerInputPlaceholder')
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={sendMutation.isPending || isInputBlocked}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || sendMutation.isPending || isInputBlocked}
          className="bg-burgundy hover:bg-burgundy-dark disabled:opacity-40 text-white rounded-lg px-3 py-2 text-sm font-medium flex-shrink-0"
        >
          {t('common.send', 'Send')}
        </button>
      </div>
    </div>
  );
}
