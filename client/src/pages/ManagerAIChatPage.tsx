import { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../components/common/ThiingsIcon';
import ManagerAIUsageBar from '../components/dashboard/ManagerAIUsageBar';
import { api, authFetch } from '../services/api';
import { renderMarkdown } from '../utils/markdownRenderer';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useToast } from '../contexts/ToastContext';

// Format a stored `created_at` timestamp into a friendly, locale-aware
// chip: today's messages show "14:32", anything older shows "ontem 14:32"
// or "12 jun 14:32". Returns null when no timestamp exists so optimistic
// messages don't render an empty chip during the brief in-flight window.
function formatTimestamp(iso: string | undefined, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86_400_000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  if (yesterday) return `${locale.startsWith('pt') ? 'ontem' : locale.startsWith('es') ? 'ayer' : 'yesterday'} ${time}`;
  return `${d.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} ${time}`;
}

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

const MAX_INPUT_CHARS = 2000;

export default function ManagerAIChatPage() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('pageTitles.managerAI', 'Manager AI | seatable'));
  const lang = i18n.language as keyof typeof SUGGESTED_PROMPTS;
  const toast = useToast();
  const [input, setInput] = useState('');
  // Tracks which assistant bubble just got copied — used to show a transient
  // "Copiado" check state for ~1.5s without needing a per-message ref.
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  // Track the last message that failed to send so the user can retry with
  // one click instead of re-typing. Cleared when a fresh send starts (in
  // onMutate) or when the user starts typing again.
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isFirstScrollRef = useRef(true);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ history: Message[] }>({
    queryKey: ['manager-chat-history'],
    queryFn: () => api.get('/manager-chat').then((r) => r.data),
    // Audit 2026-06: was `refetchOnWindowFocus: false` to dodge dup-message
    // races between optimistic updates and background refetches. The
    // `(role, created_at)` dedupe at line ~110 handles those races correctly
    // now, so we can re-enable focus refetch — without it, a tab left open
    // overnight showed yesterday's data until manual reload.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const { data: usageData } = useQuery<UsageData>({
    queryKey: ['manager-usage'],
    queryFn: () => api.get('/manager-usage').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Distinguish "feature not on this plan" from "you've used up this month".
  // The audit found we showed "Monthly limit reached" with usage 0 / 0 for
  // trial users who never had Manager AI in the first place — confusing,
  // because nothing was actually "reached". Limit === 0 is the
  // feature-not-included case, anything > 0 is real quota.
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

  // Deduplicate DB-persisted turns by (role, created_at) to handle race
  // conditions between optimistic updates and background refetches. Optimistic
  // turns (no created_at) always render — they're added once via onMutate and
  // replaced via onSuccess. Keying on content like the previous implementation
  // hid legitimate repeat questions ("Quantas reservas hoje?" asked twice).
  const messages: Message[] = useMemo(() => {
    const history = data?.history || [];
    const seen = new Set<string>();
    return history.filter((m) => {
      if (!m.created_at) return true;
      const key = `${m.role}:${m.created_at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data?.history]);

  // Track the assistant's in-flight reply text as it streams in so the UI can
  // render incremental tokens before the full response is persisted to DB.
  // Kept as a ref-like piece of state (not a ref) so React re-renders on each
  // token write — the streaming bubble lives in this state, the persisted
  // turn lives in messages[] once the SSE 'done' event lands.
  const [streamingReply, setStreamingReply] = useState<string>('');

  const sendMutation = useMutation({
    // Streaming sender — consumes the SSE endpoint that the backend's
    // handleChatStream emits. The non-streaming POST still exists as the
    // server-side path (for cron/WhatsApp callers), but the in-app UI now
    // surfaces tokens as they arrive, which is the difference between
    // "Thinking…" for 8s and a typewriter effect that feels alive.
    mutationFn: async (message: string): Promise<{ reply: string }> => {
      const res = await authFetch('/api/manager-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Tells the route handler to dispatch to handleChatStream rather
          // than the legacy handleChat. Matches the
          // `req.headers.accept.includes('text/event-stream')` branch in
          // api/manager-chat.js line 22.
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ message }),
      });
      if (!res.ok || !res.body) {
        // Surface HTTP errors so onError can catch them and rebuild the
        // retry banner with the original message. Quota responses (403/429)
        // arrive as plain JSON, not SSE, so parse defensively.
        let errMsg = `Stream error (HTTP ${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) errMsg = body.error;
        } catch { /* not JSON, keep generic */ }
        throw new Error(errMsg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullReply = '';

      // SSE frame parser. The backend writes one `data: {...}\n\n` frame
      // per token (and one `start`/`done` frame each side). We accumulate
      // bytes across reads, split on the double-newline frame boundary,
      // and parse each frame's JSON payload.
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        // Keep the last (possibly partial) frame in the buffer for the next
        // read; emit everything else now.
        buffer = frames.pop() || '';
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice('data:'.length).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.type === 'token' && typeof evt.text === 'string') {
              fullReply += evt.text;
              setStreamingReply(fullReply);
            } else if (evt.type === 'error') {
              throw new Error(evt.error || 'stream error');
            }
            // 'start' and 'done' frames are informational — no UI change.
          } catch (err) {
            // Tolerate malformed frames; if it was an error frame we
            // already threw above.
            if (err instanceof Error && err.message !== 'stream error') {
              // Other parse errors fall through silently — partial JSON.
            } else {
              throw err;
            }
          }
        }
      }

      return { reply: fullReply };
    },
    onMutate: (message) => {
      const previous = qc.getQueryData<{ history: Message[] }>(['manager-chat-history']);
      qc.setQueryData<{ history: Message[] }>(['manager-chat-history'], (old) => ({
        history: [...(old?.history || []), { role: 'manager', content: message }],
      }));
      // Reset the streaming bubble for the new turn.
      setStreamingReply('');
      // Clear any prior failure now that a fresh send is in flight.
      setLastFailedMessage(null);
      return { previous };
    },
    onError: (_err, message, context) => {
      if (context?.previous) {
        qc.setQueryData(['manager-chat-history'], context.previous);
      }
      setStreamingReply('');
      // Remember what failed so the Retry button below can resend without
      // the user having to re-type their question. Cleared on successful
      // send (onSuccess) and on every new send attempt (onMutate above).
      setLastFailedMessage(message);
    },
    onSuccess: ({ reply }, sentMessage, context) => {
      // Drop the streaming-bubble buffer now that the persisted turn is
      // about to render in messages[].
      setStreamingReply('');
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
      // Optimistically increment usage counter so the UI reflects the new message immediately
      qc.setQueryData<UsageData>(['manager-usage'], (old) =>
        old ? { ...old, used: old.used + 1 } : old
      );
      // Also refetch from backend to reconcile (fire-and-forget tracking may lag)
      qc.invalidateQueries({ queryKey: ['manager-usage'] });
      // Successful send → drop any stale retry hint.
      setLastFailedMessage(null);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: isFirstScrollRef.current ? 'auto' : 'smooth',
    });
    isFirstScrollRef.current = false;
    // Re-trigger on streamingReply.length too so the view tails the
    // typewriter effect — without this the user has to manually scroll
    // every time a long reply spills past the viewport.
  }, [messages.length, sendMutation.isPending, streamingReply]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending || isInputBlocked) return;
    // Defensive: the textarea has maxLength but a paste-and-keystroke race
    // could in theory squeeze past it. Hard-cap here too.
    const capped = trimmed.length > MAX_INPUT_CHARS ? trimmed.slice(0, MAX_INPUT_CHARS) : trimmed;
    setInput('');
    sendMutation.mutate(capped);
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
    // Clear stale error banner as soon as the user starts typing a new message
    if (sendMutation.isError) sendMutation.reset();
    // Auto-grow textarea
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  // Copy an assistant reply to clipboard. Audit found owners constantly want
  // to forward AI insights to WhatsApp / their team but had to drag-select.
  // Uses navigator.clipboard.writeText with a silent fallback on older browsers
  // (Safari iOS < 13.4) via a hidden textarea + execCommand.
  const handleCopy = async (text: string, idx: number) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Legacy fallback — keeps the action working when clipboard API is
        // missing (some embedded webviews) or blocked by HTTP origin.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
      }
      setCopiedIdx(idx);
      window.setTimeout(() => setCopiedIdx((current) => (current === idx ? null : current)), 1500);
    } catch {
      toast.error(t('managerAI.copyFailed', 'Não foi possível copiar.'));
    }
  };

  // "Nova conversa" — hard-deletes the app-channel history for this restaurant
  // so the user can start fresh without the conversation context bleeding into
  // future replies. The DELETE hits the same /api/manager-chat route handler.
  const newConversationMutation = useMutation({
    mutationFn: () => authFetch('/api/manager-chat', { method: 'DELETE' }).then((r) => {
      if (!r.ok) throw new Error(`Reset failed (${r.status})`);
      return r.json();
    }),
    onSuccess: () => {
      qc.setQueryData<{ history: Message[] }>(['manager-chat-history'], { history: [] });
      setStreamingReply('');
      setLastFailedMessage(null);
      toast.success(t('managerAI.newConversationDone', 'Nova conversa iniciada.'));
    },
    onError: () => {
      toast.error(t('managerAI.newConversationFailed', 'Não foi possível limpar a conversa.'));
    },
  });

  const handleNewConversation = () => {
    if (messages.length === 0 || newConversationMutation.isPending) return;
    if (!window.confirm(t('managerAI.newConversationConfirm', 'Limpar conversa? O Manager AI esquecerá o contexto atual.'))) return;
    newConversationMutation.mutate();
  };

  const prompts = SUGGESTED_PROMPTS[lang] || SUGGESTED_PROMPTS.en;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-glass-panel backdrop-blur-glass-nav border-b border-glass-border-dark px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            to="/host-dashboard/simple"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-soft-gray text-muted-stone hover:text-deep-charcoal transition-colors"
            aria-label={t('managerAI.backToDashboard', 'Back to dashboard')}
          >
            <ThiingsIcon name="arrow-left" pxSize={18} />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-burgundy/10 flex items-center justify-center overflow-hidden">
              <img src="/favicon.svg" alt="" aria-hidden="true" className="w-5 h-5" />
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
        <div className="flex items-center gap-3">
          {/* "Nova conversa" — only renders when there's history to clear,
              so empty-state users don't see an action they can't take. */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleNewConversation}
              disabled={newConversationMutation.isPending}
              className="text-xs font-medium text-muted-stone hover:text-deep-charcoal transition-colors disabled:opacity-40 flex items-center gap-1.5"
              aria-label={t('managerAI.newConversation', 'Nova conversa')}
            >
              <ThiingsIcon name="refresh" pxSize={14} />
              <span className="hidden sm:inline">{t('managerAI.newConversation', 'Nova conversa')}</span>
            </button>
          )}
          <div className="hidden sm:block w-48">
            <ManagerAIUsageBar />
          </div>
        </div>
      </div>

      {/* Messages area
          role="log" + aria-live="polite" announces NEW assistant messages
          to screen readers without preempting whatever the user was doing.
          aria-relevant="additions" so the entire history isn't re-read
          when prior messages re-render. */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label={t('managerAI.conversationLabel', 'Manager AI conversation')}
        >
          {isLoading && (
            <p className="text-sm text-muted-stone text-center py-12">{t('managerAI.loadingHistory', 'Loading history...')}</p>
          )}

          {/* Empty state with suggested prompts */}
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-16 space-y-8">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-burgundy/10 flex items-center justify-center mx-auto overflow-hidden">
                  <img src="/favicon.svg" alt="" aria-hidden="true" className="w-10 h-10" />
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
                    className="text-left px-4 py-3 bg-glass-card backdrop-blur-glass-card border border-glass-border rounded-xl text-sm text-deep-charcoal hover:bg-white/80 hover:border-burgundy/30 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((m, i) => {
            const ts = formatTimestamp(m.created_at, i18n.language);
            const isAssistant = m.role === 'assistant';
            const isCopied = copiedIdx === i;
            return (
              <div
                key={m.created_at ? `${m.role}-${m.created_at}` : `opt-${m.role}-${i}`}
                className={'flex group ' + (isAssistant ? 'justify-start' : 'justify-end')}
              >
                {isAssistant && (
                  <div className="w-7 h-7 rounded-full bg-burgundy/10 flex items-center justify-center flex-shrink-0 mt-1 mr-2 overflow-hidden">
                    <img src="/favicon.svg" alt={t('managerAI.assistantAvatarAlt', 'Manager AI avatar')} className="w-4 h-4" />
                  </div>
                )}
                <div className={'flex flex-col gap-1 max-w-[75%] ' + (isAssistant ? 'items-start' : 'items-end')}>
                  <div
                    className={
                      'relative rounded-2xl px-4 py-3 text-sm break-words leading-relaxed ' +
                      (isAssistant
                        ? 'bg-glass-card backdrop-blur-glass-card border border-glass-border text-deep-charcoal'
                        : 'bg-burgundy text-white')
                    }
                  >
                    {isAssistant ? renderMarkdown(m.content) : m.content}
                    {/* Copy affordance — hover-revealed on desktop, always
                        visible on touch via group-focus. Assistant bubbles
                        only; the user's own messages don't need copy. */}
                    {isAssistant && (
                      <button
                        type="button"
                        onClick={() => handleCopy(m.content, i)}
                        aria-label={t('managerAI.copyMessage', 'Copiar mensagem')}
                        className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity w-7 h-7 rounded-full bg-white border border-glass-border-input shadow-sm flex items-center justify-center text-muted-stone hover:text-deep-charcoal hover:border-burgundy/30"
                      >
                        <ThiingsIcon name={isCopied ? 'check' : 'copy'} pxSize={12} />
                      </button>
                    )}
                  </div>
                  {/* Timestamp chip — subtle, only renders when we have a
                      persisted created_at (optimistic in-flight turns skip). */}
                  {ts && (
                    <span className="text-[10px] text-muted-stone/70 px-1">{ts}</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Streaming reply bubble — shows assistant tokens as they arrive
              from the SSE endpoint. Replaces the "Thinking…" indicator once
              the first token lands. The persisted bubble takes over via
              messages[] once onSuccess fires and we set streamingReply=''. */}
          {sendMutation.isPending && streamingReply && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-burgundy/10 flex items-center justify-center flex-shrink-0 mt-1 mr-2 overflow-hidden">
                <img src="/favicon.svg" alt={t('managerAI.assistantAvatarAlt', 'Manager AI avatar')} className="w-4 h-4" />
              </div>
              <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm break-words leading-relaxed bg-glass-card backdrop-blur-glass-card border border-glass-border text-deep-charcoal">
                {renderMarkdown(streamingReply)}
                {/* Blinking cursor while streaming — tactile signal that
                    more tokens are coming. Hidden by reduced-motion. */}
                <span aria-hidden="true" className="inline-block w-[2px] h-[1em] bg-burgundy/60 align-middle ml-0.5 animate-pulse motion-reduce:hidden" />
              </div>
            </div>
          )}

          {/* Thinking indicator — only while we're waiting on the first
              streamed token. Once the streamingReply has any content, the
              bubble above takes over. */}
          {sendMutation.isPending && !streamingReply && (
            <div className="flex justify-start" role="status" aria-label={t('managerAI.thinkingAriaLabel', 'AI is thinking')}>
              <div className="w-7 h-7 rounded-full bg-burgundy/10 flex items-center justify-center flex-shrink-0 mt-1 mr-2">
                <ThiingsIcon name="sparkles" pxSize={14} className="text-burgundy animate-spin" />
              </div>
              <div className="bg-glass-card backdrop-blur-glass-card border border-glass-border rounded-2xl px-4 py-3 text-sm text-muted-stone flex items-center gap-1.5">
                <span>{t('dashboard.thinking', 'Thinking')}</span>
                <span className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 bg-burgundy/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-burgundy/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-burgundy/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          )}

          {/* Error state — now with a Retry button that resends the
              exact message that failed, so the user doesn't have to
              re-type it. The optimistic-append already rolled the
              failed message back in onError, so retry effectively
              re-attempts a fresh send. */}
          {sendMutation.isError && (
            <div className="text-center space-y-2" role="alert">
              <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2 inline-block">
                {t('managerAI.failedToSend', 'Failed to send. Please try again.')}
              </p>
              {lastFailedMessage && (
                <div>
                  <button
                    type="button"
                    onClick={() => sendMutation.mutate(lastFailedMessage)}
                    className="text-sm font-semibold text-burgundy hover:text-burgundy-dark underline underline-offset-2"
                  >
                    {t('managerAI.retry', 'Retry')}
                  </button>
                </div>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Quota / not-included banner */}
      {(isFeatureUnavailable || isQuotaExhausted) && (
        <div className="px-4 py-2 text-sm text-amber-700 bg-amber-50 border-t border-amber-100 flex items-center justify-center gap-2 flex-shrink-0">
          <span>
            {isFeatureUnavailable
              ? t('dashboard.featureNotIncluded', 'Manager AI is not included on your current plan')
              : t('dashboard.limitReached', 'Message limit reached')}
          </span>
          <a href="/subscription/manage" className="underline font-medium">
            {t('managerAI.upgrade', 'Upgrade')} &rarr;
          </a>
        </div>
      )}

      {/* Input area */}
      <div className="bg-glass-panel backdrop-blur-glass-nav border-t border-glass-border-dark px-4 sm:px-6 py-4 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex gap-3 items-end">
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <textarea
              ref={inputRef}
              className="w-full rounded-xl border border-glass-border-input bg-white/60 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy max-h-40"
              placeholder={
                isFeatureUnavailable
                  ? t('dashboard.featureUpgradePlaceholder', 'Upgrade your plan to chat with Manager AI')
                  : isQuotaExhausted
                  ? t('dashboard.limitReachedUpgrade', 'Upgrade to send more messages')
                  : t('dashboard.managerInputPlaceholder', 'Ask about your restaurant...')
              }
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={sendMutation.isPending || isInputBlocked}
              maxLength={MAX_INPUT_CHARS}
              rows={1}
            />
            {input.length >= MAX_INPUT_CHARS * 0.8 && (
              <p className={`text-xs text-right ${input.length >= MAX_INPUT_CHARS ? 'text-red-500' : 'text-muted-stone'}`}>
                {t('managerAI.charCount', { used: input.length, max: MAX_INPUT_CHARS, defaultValue: `${input.length}/${MAX_INPUT_CHARS} characters` })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending || isInputBlocked}
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
