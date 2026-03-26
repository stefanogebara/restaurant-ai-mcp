import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../components/common/ThiingsIcon';
import ManagerAIUsageBar from '../components/dashboard/ManagerAIUsageBar';
import { api } from '../services/api';
import { renderMarkdown } from '../utils/markdownRenderer';

// ---------- Types ----------

interface Message {
  role: 'manager' | 'assistant';
  content: string;
  created_at?: string;
}

interface UsageData {
  used: number;
  limit: number | null;
}

// ---------- Suggested prompts ----------

const SUGGESTED_PROMPTS = {
  en: [
    'How are reservations looking for today?',
    'Which tables have the highest revenue?',
    'Any no-shows this week?',
    'Suggest staffing for Friday dinner',
  ],
  'pt-BR': [
    'Como estão as reservas de hoje?',
    'Quais mesas geraram mais receita?',
    'Teve no-shows essa semana?',
    'Sugerir escala para sexta à noite',
  ],
  es: [
    '¿Cómo están las reservas de hoy?',
    '¿Qué mesas generaron más ingresos?',
    '¿Hubo no-shows esta semana?',
    'Sugerir personal para el viernes',
  ],
};

// ---------- Page component ----------

export default function ManagerAIChatPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as keyof typeof SUGGESTED_PROMPTS;
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ history: Message[] }>({
    queryKey: ['manager-chat-history'],
    queryFn: () => api.get('/manager-chat').then((r) => r.data),
  });

  const { data: usageData } = useQuery<UsageData>({
    queryKey: ['manager-usage'],
    queryFn: () => api.get('/manager-usage').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
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
      qc.invalidateQueries({ queryKey: ['manager-usage'] });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sendMutation.isPending]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending || isQuotaExhausted) return;
    setInput('');
    sendMutation.mutate(trimmed);
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-grow textarea
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const prompts = SUGGESTED_PROMPTS[lang] || SUGGESTED_PROMPTS.en;

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="bg-white border-b border-border-gray px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            to="/host-dashboard/simple"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-soft-gray text-muted-stone hover:text-deep-charcoal transition-colors"
            aria-label={t('managerAI.backToDashboard', 'Back to dashboard')}
          >
            <ThiingsIcon name="arrow-left" pxSize={18} />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-burgundy/10 flex items-center justify-center">
              <ThiingsIcon name="sparkles" pxSize={16} className="text-burgundy" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-deep-charcoal leading-tight">
                {t('dashboard.managerAssistant', 'Manager AI')}
              </h1>
              <p className="text-xs text-muted-stone leading-tight">
                {t('managerAI.subtitle', 'Your restaurant intelligence assistant')}
              </p>
            </div>
          </div>
        </div>
        <div className="hidden sm:block w-48">
          <ManagerAIUsageBar />
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          {isLoading && (
            <p className="text-sm text-muted-stone text-center py-12">{t('managerAI.loadingHistory', 'Loading history...')}</p>
          )}

          {/* Empty state with suggested prompts */}
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-16 space-y-8">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-burgundy/10 flex items-center justify-center mx-auto">
                  <ThiingsIcon name="sparkles" pxSize={32} className="text-burgundy" />
                </div>
                <h2 className="text-xl font-bold text-deep-charcoal">
                  {t('dashboard.managerAssistant', 'Manager AI')}
                </h2>
                <p className="text-sm text-muted-stone max-w-md">
                  {t('dashboard.managerAssistantHint', 'Ask me about your restaurant — reservations, revenue, staffing, insights, and more.')}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {prompts.map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setInput(prompt);
                      inputRef.current?.focus();
                    }}
                    className="text-left px-4 py-3 bg-white border border-border-gray rounded-xl text-sm text-deep-charcoal hover:bg-soft-gray hover:border-burgundy/30 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((m, i) => (
            <div key={i} className={'flex ' + (m.role === 'manager' ? 'justify-end' : 'justify-start')}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-burgundy/10 flex items-center justify-center flex-shrink-0 mt-1 mr-2">
                  <ThiingsIcon name="sparkles" pxSize={14} className="text-burgundy" />
                </div>
              )}
              <div
                className={
                  'max-w-[75%] rounded-2xl px-4 py-3 text-sm break-words leading-relaxed ' +
                  (m.role === 'manager'
                    ? 'bg-burgundy text-white'
                    : 'bg-white border border-border-gray text-deep-charcoal')
                }
              >
                {m.role === 'assistant' ? renderMarkdown(m.content) : m.content}
              </div>
            </div>
          ))}

          {/* Thinking indicator */}
          {sendMutation.isPending && (
            <div className="flex justify-start" role="status" aria-label="AI is thinking">
              <div className="w-7 h-7 rounded-full bg-burgundy/10 flex items-center justify-center flex-shrink-0 mt-1 mr-2">
                <ThiingsIcon name="sparkles" pxSize={14} className="text-burgundy animate-spin" />
              </div>
              <div className="bg-white border border-border-gray rounded-2xl px-4 py-3 text-sm text-muted-stone flex items-center gap-1.5">
                <span>{t('dashboard.thinking', 'Thinking')}</span>
                <span className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 bg-burgundy/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-burgundy/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-burgundy/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          )}

          {/* Error state */}
          {sendMutation.isError && (
            <div className="text-center">
              <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2 inline-block">
                {t('managerAI.failedToSend', 'Failed to send. Please try again.')}
              </p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Quota banner */}
      {isQuotaExhausted && (
        <div className="px-4 py-2 text-sm text-amber-700 bg-amber-50 border-t border-amber-100 flex items-center justify-center gap-2 flex-shrink-0">
          <span>{t('dashboard.limitReached', 'Message limit reached')}</span>
          <a href="/subscription/manage" className="underline font-medium">
            {t('managerAI.upgrade', 'Upgrade')} &rarr;
          </a>
        </div>
      )}

      {/* Input area */}
      <div className="bg-white border-t border-border-gray px-4 sm:px-6 py-4 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex gap-3 items-end">
          <textarea
            ref={inputRef}
            className="flex-1 min-w-0 rounded-xl border border-border-gray px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy max-h-40"
            placeholder={
              isQuotaExhausted
                ? t('dashboard.limitReachedUpgrade', 'Upgrade to send more messages')
                : t('dashboard.managerInputPlaceholder', 'Ask about your restaurant...')
            }
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={sendMutation.isPending || isQuotaExhausted}
            rows={1}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending || isQuotaExhausted}
            aria-label={t('managerAI.sendMessage', 'Send message')}
            className="bg-burgundy hover:bg-burgundy-dark disabled:opacity-40 text-white rounded-xl px-4 py-3 text-sm font-medium flex-shrink-0 transition-colors flex items-center gap-2"
          >
            <ThiingsIcon name="arrow-right" pxSize={16} className="text-white" />
          </button>
        </div>

        {/* Mobile usage bar */}
        <div className="sm:hidden max-w-3xl mx-auto mt-2">
          <ManagerAIUsageBar />
        </div>
      </div>
    </div>
  );
}
