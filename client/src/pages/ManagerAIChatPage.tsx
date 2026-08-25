import { useState, useRef, useEffect, useMemo } from 'react';
import { readSseFrames } from '../lib/sseStream';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../components/common/ThiingsIcon';
import ManagerAIUsageBar from '../components/dashboard/ManagerAIUsageBar';
import { api, authFetch } from '../services/api';
import ManagerRichMessage from '../components/dashboard/ManagerRichMessage';
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

// Um marco REAL do raciocínio do agente, emitido pelo backend enquanto
// acontece (frame SSE {type:'phase'}): leitura de contexto, contexto pronto,
// ferramenta de comparação. Nunca é inventado no cliente — a UI só mostra o
// que o servidor disse que fez.
interface ThoughtPhase {
  key: string;
  memories?: number;
  a?: string;
  b?: string;
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
  const [streamingReply, setStreamingReply] = useState<string>('');

  // Chain-of-thought: os marcos que o backend emitiu para o turno em voo, e o
  // resumo do último turno respondido (vira o chip "raciocinou por Xs" sobre a
  // resposta final). Refs espelham o estado para o onSuccess não ler closure
  // velha.
  const [thoughtPhases, setThoughtPhases] = useState<ThoughtPhase[]>([]);
  const thoughtPhasesRef = useRef<ThoughtPhase[]>([]);
  const thoughtStartRef = useRef<number>(0);
  const [lastThought, setLastThought] = useState<{ phases: ThoughtPhase[]; ms: number } | null>(null);

  // Rótulo humano de um marco. Interpolação manual (não i18next) porque os
  // params variam por chave e o fallback precisa funcionar sem catálogo.
  const phaseLabel = (p: ThoughtPhase): string => {
    switch (p.key) {
      case 'context':
        return t('managerAI.phaseContext', 'Lendo a memória e o dia do restaurante…');
      case 'context_ready':
        return p.memories
          ? t('managerAI.phaseContextReadyN', 'Contexto pronto — {{n}} lembranças relevantes', { n: p.memories })
          : t('managerAI.phaseContextReady', 'Contexto pronto');
      case 'compare':
        return t('managerAI.phaseCompare', 'Comparando períodos: {{a}} × {{b}}', { a: p.a ?? '', b: p.b ?? '' });
      default:
        return p.key;
    }
  };

  // Versão curta pro chip pós-resposta ("contexto · comparação").
  const phaseShort = (p: ThoughtPhase): string | null => {
    switch (p.key) {
      case 'context_ready':
        return t('managerAI.phaseShortContext', 'contexto');
      case 'compare':
        return t('managerAI.phaseShortCompare', 'comparação de períodos');
      default:
        return null;
    }
  };

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

      // O parser de frames SSE saiu para lib/sseStream — o onboarding em
      // conversa fala o mesmo protocolo, e a remontagem de frame partido
      // entre chunks é sutil demais para viver copiada em dois lugares.
      let fullReply = '';
      await readSseFrames(res.body, (evt) => {
        if (evt.type === 'token' && typeof evt.text === 'string') {
          fullReply += evt.text;
          setStreamingReply(fullReply);
        } else if (evt.type === 'phase' && typeof evt.key === 'string') {
          // Marco real do raciocínio — entra na cadeia visível.
          const next = [...thoughtPhasesRef.current, evt as unknown as ThoughtPhase];
          thoughtPhasesRef.current = next;
          setThoughtPhases(next);
        }
        // 'start' e 'done' são informativos — sem mudança de UI.
        // 'error' é lançado por readSseFrames.
      });

      return { reply: fullReply };
    },
    onMutate: (message) => {
      const previous = qc.getQueryData<{ history: Message[] }>(['manager-chat-history']);
      qc.setQueryData<{ history: Message[] }>(['manager-chat-history'], (old) => ({
        history: [...(old?.history || []), { role: 'manager', content: message }],
      }));
      // Reset the streaming bubble + chain-of-thought for the new turn.
      setStreamingReply('');
      setThoughtPhases([]);
      thoughtPhasesRef.current = [];
      thoughtStartRef.current = Date.now();
      setLastThought(null);
      // Clear any prior failure now that a fresh send is in flight.
      setLastFailedMessage(null);
      return { previous };
    },
    onError: (_err, message, context) => {
      if (context?.previous) {
        qc.setQueryData(['manager-chat-history'], context.previous);
      }
      setStreamingReply('');
      setThoughtPhases([]);
      thoughtPhasesRef.current = [];
      // Remember what failed so the Retry button below can resend without
      // the user having to re-type their question. Cleared on successful
      // send (onSuccess) and on every new send attempt (onMutate above).
      setLastFailedMessage(message);
    },
    onSuccess: ({ reply }, sentMessage, context) => {
      // Drop the streaming-bubble buffer now that the persisted turn is
      // about to render in messages[].
      setStreamingReply('');
      // A cadeia colapsa num resumo discreto sobre a resposta final.
      if (thoughtPhasesRef.current.length > 0) {
        setLastThought({
          phases: thoughtPhasesRef.current,
          ms: Date.now() - thoughtStartRef.current,
        });
      }
      setThoughtPhases([]);
      thoughtPhasesRef.current = [];
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
    // Re-trigger on streamingReply/thoughtPhases too so the view tails the
    // typewriter effect and the chain-of-thought as steps land.
  }, [messages.length, sendMutation.isPending, streamingReply, thoughtPhases.length]);

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
      setLastThought(null);
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

  // Índice da última bolha do assistente — é sobre ela que o resumo do
  // raciocínio (lastThought) se pendura.
  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  }, [messages]);

  const avatar = (size: string, img: string) => (
    <div className={`${size} rounded-[14px] bg-glass-modal backdrop-blur-glass-chip border border-glass-border shadow-glass-nav flex items-center justify-center flex-shrink-0 overflow-hidden`}>
      <img src="/favicon.svg" alt="" aria-hidden="true" className={img} />
    </div>
  );

  return (
    <div className="h-screen relative overflow-hidden">
      {/* ---------- Camada de rolagem — passa POR BAIXO do header e do
           composer flutuantes; as máscaras de gradiente fazem o conteúdo
           surgir e sumir de forma contínua, sem linha de corte. ---------- */}
      <div
        className="h-full overflow-y-auto"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0, black 88px, black calc(100% - 132px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 88px, black calc(100% - 132px), transparent 100%)',
        }}
      >
        <div
          className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 pb-48 space-y-6"
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
            <div className="flex flex-col items-center justify-center pt-14 pb-8 space-y-9 animate-fade-in">
              <div className="text-center space-y-4">
                <div className="w-[72px] h-[72px] rounded-[22px] bg-glass-modal backdrop-blur-glass-card border border-glass-border shadow-glass-card flex items-center justify-center mx-auto overflow-hidden">
                  <img src="/favicon.svg" alt="" aria-hidden="true" className="w-10 h-10" />
                </div>
                <h2 className="font-serif text-3xl sm:text-4xl text-deep-charcoal">
                  {t('dashboard.managerAssistant', 'Manager AI')}
                </h2>
                <p className="text-sm text-muted-stone max-w-md leading-relaxed">
                  {t('dashboard.managerAssistantHint', 'Ask me about your restaurant — reservations, revenue, staffing, insights, and more.')}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2.5 w-full max-w-xl">
                {prompts.map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setInput(prompt);
                      inputRef.current?.focus();
                    }}
                    style={{ animationDelay: `${i * 90}ms` }}
                    className="animate-thought-in px-5 py-2.5 bg-glass-subtle backdrop-blur-glass-chip border border-glass-border rounded-[46px] text-sm text-deep-charcoal hover:bg-white/75 hover:border-burgundy/25 hover:-translate-y-0.5 transition-all duration-300 motion-reduce:transition-none"
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
                className={'flex flex-col ' + (isAssistant ? 'items-start' : 'items-end')}
              >
                {/* Resumo do raciocínio — pendurado sobre a última resposta:
                    quantos segundos e quais etapas REAIS aconteceram. */}
                {isAssistant && i === lastAssistantIdx && lastThought && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-stone/80 mb-1.5 pl-11 animate-fade-in">
                    <ThiingsIcon name="sparkles" pxSize={10} />
                    <span>
                      {t('managerAI.thoughtSummary', 'Raciocinou por {{s}}s', { s: Math.max(1, Math.round(lastThought.ms / 1000)) })}
                      {lastThought.phases.map(phaseShort).filter(Boolean).length > 0 &&
                        ` — ${lastThought.phases.map(phaseShort).filter(Boolean).join(' · ')}`}
                    </span>
                  </div>
                )}
                <div className={'flex group w-full ' + (isAssistant ? 'justify-start' : 'justify-end')}>
                  {isAssistant && (
                    <div className="mr-2.5 mt-1">{avatar('w-8 h-8', 'w-[18px] h-[18px]')}</div>
                  )}
                  <div className={'flex flex-col gap-1 ' + (isAssistant ? 'items-start max-w-[88%] sm:max-w-[82%]' : 'items-end max-w-[78%]')}>
                    {/* Assistente fala SEM card — texto direto no canvas, como
                        os chats de IA modernos: o vidro fica pros objetos
                        (gráficos, raciocínio), a prosa respira no gradiente.
                        A fala do gerente continua na pílula burgundy. */}
                    {isAssistant ? (
                      <div className="text-[15px] break-words leading-relaxed text-deep-charcoal animate-slide-up motion-reduce:animate-none pt-1">
                        <ManagerRichMessage content={m.content} />
                        {/* Linha de ações discreta no hover — sem card não há
                            canto pra pendurar botão; a linha fica abaixo. */}
                        <div className="flex items-center gap-2 mt-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => handleCopy(m.content, i)}
                            aria-label={t('managerAI.copyMessage', 'Copiar mensagem')}
                            className="flex items-center gap-1 text-[11px] text-muted-stone hover:text-deep-charcoal transition-colors"
                          >
                            <ThiingsIcon name={isCopied ? 'check' : 'copy'} pxSize={11} />
                            {isCopied ? t('managerAI.copied', 'Copiado') : t('managerAI.copy', 'Copiar')}
                          </button>
                          {ts && <span className="text-[10px] text-muted-stone/70">{ts}</span>}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="px-5 py-3.5 text-[15px] break-words leading-relaxed animate-slide-up motion-reduce:animate-none bg-gradient-to-br from-burgundy to-burgundy-dark text-white shadow-glass-card rounded-[22px] rounded-br-lg">
                          {m.content}
                        </div>
                        {ts && <span className="text-[10px] text-muted-stone/70 px-1.5">{ts}</span>}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* ---------- Chain-of-thought — o raciocínio aparecendo ao vivo.
               Cada linha é um marco REAL emitido pelo backend enquanto
               acontece; o passo ativo ganha o brilho líquido. Quando os
               tokens começam, o cabeçalho troca pra "Escrevendo" e a bolha
               de resposta assume logo abaixo. ---------- */}
          {sendMutation.isPending && (
            <div className="flex justify-start animate-thought-in" role="status" aria-label={t('managerAI.thinkingAriaLabel', 'AI is thinking')}>
              <div className="mr-2.5 mt-1">{avatar('w-8 h-8', 'w-[18px] h-[18px]')}</div>
              <div className="min-w-[260px] max-w-[78%] bg-glass-subtle backdrop-blur-glass-chip border border-glass-border rounded-[20px] rounded-bl-lg px-5 py-3.5 space-y-2.5">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-stone">
                  <span className="w-1.5 h-1.5 rounded-full bg-burgundy animate-pulse motion-reduce:animate-none" />
                  {streamingReply
                    ? t('managerAI.writing', 'Escrevendo')
                    : t('managerAI.reasoning', 'Raciocinando')}
                </div>
                {thoughtPhases.length === 0 && !streamingReply && (
                  <div className="thought-active text-[13px] text-deep-charcoal/70 px-1 -mx-1">
                    {t('managerAI.phaseWaking', 'Acordando o contexto do restaurante…')}
                  </div>
                )}
                {thoughtPhases.map((p, i) => {
                  const isActive = i === thoughtPhases.length - 1 && !streamingReply;
                  return (
                    <div key={`${p.key}-${i}`} className="animate-thought-in flex items-start gap-2 text-[13px] leading-snug text-deep-charcoal/80">
                      <span className="mt-[5px] flex-shrink-0">
                        {isActive ? (
                          <span className="block w-2 h-2 rounded-full border-[1.5px] border-burgundy/60 animate-pulse motion-reduce:animate-none" />
                        ) : (
                          <ThiingsIcon name="check" pxSize={10} className="text-emerald-600" />
                        )}
                      </span>
                      <span className={isActive ? 'thought-active px-1 -mx-1' : ''}>{phaseLabel(p)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Streaming reply bubble — shows assistant tokens as they arrive
              from the SSE endpoint. The persisted bubble takes over via
              messages[] once onSuccess fires and we set streamingReply=''. */}
          {sendMutation.isPending && streamingReply && (
            <div className="flex justify-start">
              <div className="mr-2.5 mt-1">{avatar('w-8 h-8', 'w-[18px] h-[18px]')}</div>
              <div className="max-w-[88%] sm:max-w-[82%] pt-1 text-[15px] break-words leading-relaxed text-deep-charcoal">
                <ManagerRichMessage content={streamingReply} />
                {/* Blinking cursor while streaming — tactile signal that
                    more tokens are coming. Hidden by reduced-motion. */}
                <span aria-hidden="true" className="inline-block w-[2px] h-[1em] bg-burgundy/60 align-middle ml-0.5 animate-pulse motion-reduce:hidden" />
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
              <p className="text-sm text-red-500 bg-red-50/90 backdrop-blur-glass-chip border border-red-100 rounded-[18px] px-4 py-2 inline-block">
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

      {/* ---------- Header flutuante — cápsula de vidro destacada do topo,
           sem borda de corte; o conteúdo rola por baixo e some na máscara. */}
      <div className="absolute top-3 sm:top-4 left-3 right-3 sm:left-6 sm:right-6 z-20 pointer-events-none">
        <div className="max-w-3xl mx-auto pointer-events-auto bg-glass-modal backdrop-blur-glass-nav border border-glass-border shadow-glass-card rounded-[24px] px-3 sm:px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/host-dashboard/simple"
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/60 text-muted-stone hover:text-deep-charcoal transition-colors flex-shrink-0"
              aria-label={t('managerAI.backToDashboard', 'Back to dashboard')}
            >
              <ThiingsIcon name="arrow-left" pxSize={18} />
            </Link>
            <div className="flex items-center gap-2.5 min-w-0">
              {avatar('w-8 h-8', 'w-5 h-5')}
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-deep-charcoal leading-tight truncate">
                  {t('dashboard.managerAssistant', 'Manager AI')}
                </h1>
                <p className="text-xs text-muted-stone leading-tight truncate">
                  {t('managerAI.subtitle', 'Your restaurant intelligence assistant')}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
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
            <div className="hidden sm:block w-44">
              <ManagerAIUsageBar />
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Composer flutuante — cápsula líquida destacada do fundo,
           input sem borda interna; o foco acende o anel burgundy no vidro. */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-3 sm:px-6 pb-4 sm:pb-6 pointer-events-none">
        <div className="max-w-3xl mx-auto pointer-events-auto space-y-2">
          {/* Quota / not-included banner */}
          {(isFeatureUnavailable || isQuotaExhausted) && (
            <div className="text-sm text-amber-800 bg-amber-50/90 backdrop-blur-glass-chip border border-amber-200/70 rounded-[18px] px-4 py-2 flex items-center justify-center gap-2">
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

          <div className="bg-glass-modal backdrop-blur-glass-modal border border-glass-border shadow-glass-modal rounded-[28px] pl-3 pr-2 py-2 flex items-end gap-2 transition-shadow focus-within:ring-2 focus-within:ring-burgundy/25">
            <textarea
              ref={inputRef}
              className="flex-1 min-w-0 bg-transparent border-0 px-2.5 py-2 text-[15px] resize-none focus:outline-none focus:ring-0 max-h-40 placeholder:text-muted-stone/80 text-deep-charcoal"
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
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || sendMutation.isPending || isInputBlocked}
              aria-label={t('managerAI.sendMessage', 'Send message')}
              className="w-10 h-10 flex-shrink-0 bg-burgundy hover:bg-burgundy-dark disabled:opacity-40 text-white rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 motion-reduce:transform-none"
            >
              <ThiingsIcon name="arrow-right" pxSize={16} className="text-white" />
            </button>
          </div>

          {input.length >= MAX_INPUT_CHARS * 0.8 && (
            <p className={`text-xs text-right px-3 ${input.length >= MAX_INPUT_CHARS ? 'text-red-500' : 'text-muted-stone'}`}>
              {t('managerAI.charCount', { used: input.length, max: MAX_INPUT_CHARS, defaultValue: `${input.length}/${MAX_INPUT_CHARS} characters` })}
            </p>
          )}

          {/* Mobile usage bar */}
          <div className="sm:hidden px-2">
            <ManagerAIUsageBar />
          </div>
        </div>
      </div>
    </div>
  );
}
