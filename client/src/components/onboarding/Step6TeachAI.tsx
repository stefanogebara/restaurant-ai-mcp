/**
 * Step 6: Teach Your AI (Chat Interview)
 *
 * Interactive chat-based interview that deeply learns about the restaurant.
 * Uses the /api/restaurant-learning/research + /chat endpoints to run an
 * adaptive 12-topic conversation. Replaces the old 5-textarea approach.
 *
 * The interview is optional — "Skip for now" proceeds without any API call.
 * Progress is shown via a topic progress bar + completion percentage.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { api } from '../../services/api';

interface Step6TeachAIProps {
  restaurantId: string;
  restaurantName?: string;
  city?: string;
  country?: string;
  website?: string;
  onNext: () => void;
}

interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
}

interface ResearchResponse {
  success: boolean;
  session_id: string;
  initial_ai_message: string;
}

interface ChatResponse {
  success: boolean;
  ai_message: string;
  quick_replies?: string[] | null;
  completion_percentage: number;
  is_complete: boolean;
  current_topic_label?: string;
}

type InterviewPhase = 'idle' | 'researching' | 'chatting' | 'generating' | 'complete';

// Topic preview shown in the idle state — kept in sync with INTERVIEW_TOPICS
// in api/services/learningInterview.js. Owners previously saw an opaque
// "12 tópicos sobre culinária..." card and didn't know what they were
// committing to → most clicked Skip. Showing the actual topics lowers the
// perceived commitment ("oh, these are easy questions about MY restaurant").
const INTERVIEW_TOPIC_KEYS = [
  'onboarding.topic.cuisineIdentity',
  'onboarding.topic.atmosphereVibe',
  'onboarding.topic.signatureDishes',
  'onboarding.topic.guestExperience',
  'onboarding.topic.uniqueDifferentiators',
  'onboarding.topic.communicationStyle',
  'onboarding.topic.specialOccasions',
  'onboarding.topic.thingsToKnow',
  'onboarding.topic.operationsPhilosophy',
  'onboarding.topic.teamCulture',
  'onboarding.topic.businessGoals',
  'onboarding.topic.aiExpectations',
] as const;

// Extract a renderable string from whatever the backend returned. The previous
// `(err.response?.data?.error as string)` cast was a lie: Supabase / PostgREST
// errors propagate as `{ code, message }` objects. setError() then held the
// object, React tried to render `<span>{error}</span>`, and the whole
// onboarding page crashed with Minified React Error #31 — ErrorBoundary
// swallowed everything, the user lost the whole flow on one /research failure.
function extractErrorMessage(err: unknown): string | undefined {
  if (!axios.isAxiosError(err)) return undefined;
  const data = err.response?.data;
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    const e = (data as Record<string, unknown>).error;
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
      return (e as { message: string }).message;
    }
    const m = (data as Record<string, unknown>).message;
    if (typeof m === 'string') return m;
  }
  return err.message || undefined;
}

export default function Step6TeachAI({
  restaurantId: _restaurantId, // eslint-disable-line @typescript-eslint/no-unused-vars
  restaurantName,
  city,
  country,
  website,
  onNext,
}: Step6TeachAIProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<InterviewPhase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completionPct, setCompletionPct] = useState(0);
  const [currentTopic, setCurrentTopic] = useState('');
  const [quickReplies, setQuickReplies] = useState<string[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Start the interview: research + get first AI message
  const startInterview = useCallback(async () => {
    setPhase('researching');
    setError(null);

    try {
      const res = await api.post<ResearchResponse>('/restaurant-learning/research', {
        restaurant_name: restaurantName || 'My Restaurant',
        city: city || 'Unknown',
        country: country || 'Unknown',
        website: website || undefined,
      });

      setSessionId(res.data.session_id);
      setMessages([{ role: 'assistant', content: res.data.initial_ai_message }]);
      setPhase('chatting');
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err: unknown) {
      setError(extractErrorMessage(err) || t('onboarding.interviewStartFailed'));
      setPhase('idle');
    }
  }, [restaurantName, city, country, website, t]);

  // Send a message in the interview
  async function sendMessage(text: string) {
    if (!sessionId || !text.trim() || isSending) return;

    const userMsg = text.trim();
    setInput('');
    setQuickReplies([]);
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setIsSending(true);
    setError(null);

    try {
      const res = await api.post<ChatResponse>('/restaurant-learning/chat', {
        session_id: sessionId,
        message: userMsg,
      });

      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.ai_message }]);
      setCompletionPct(res.data.completion_percentage);
      if (res.data.current_topic_label) setCurrentTopic(res.data.current_topic_label);
      if (res.data.quick_replies) setQuickReplies(res.data.quick_replies);

      if (res.data.is_complete) {
        // Auto-generate persona
        setPhase('generating');
        try {
          await api.post('/restaurant-learning/generate-persona', { session_id: sessionId });
        } catch (personaErr) {
          // Persona generation failed — the interview transcript is still
          // saved server-side and the persona can be regenerated later, so we
          // don't block the user. Log it so Sentry catches a wide outage.
          console.error('[Step6TeachAI] persona generation failed', personaErr);
        }
        setPhase('complete');
      }
    } catch (err: unknown) {
      setError(extractErrorMessage(err) || t('onboarding.interviewSendFailed'));
    } finally {
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  // ── Idle state: start button ──
  if (phase === 'idle') {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-6"
      >
        <div>
          <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">
            {t('onboarding.teachAIHeading')}
          </h2>
          <p className="text-stone-gray text-sm">
            {t('onboarding.teachAISubtitle')}
          </p>
        </div>

        <div className="bg-burgundy/5 border border-burgundy/10 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-burgundy/10 rounded-full flex items-center justify-center">
              <ThiingsIcon name="chat" pxSize={20} className="text-burgundy" />
            </div>
            <div>
              <p className="text-sm font-semibold text-deep-charcoal">{t('onboarding.interactiveInterview')}</p>
              <p className="text-xs text-stone-gray">{t('onboarding.interviewTopics')}</p>
            </div>
          </div>

          {/* Topic preview — let owners see the 12 conversation topics upfront
              so they know what they're committing to (5-min chat about THEIR
              restaurant) rather than guessing. Caught in 2026-05-18 audit. */}
          <div className="grid grid-cols-2 gap-1.5">
            {INTERVIEW_TOPIC_KEYS.map((key, idx) => (
              <div
                key={key}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/60 border border-burgundy/10"
              >
                <span className="text-[10px] font-mono text-burgundy/60 w-4">{idx + 1}.</span>
                <span className="text-xs text-deep-charcoal truncate">{t(key)}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-stone-gray">
            {t('onboarding.interviewExplainer')}
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            <ThiingsIcon name="alert-circle" pxSize={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <button
            type="button"
            onClick={onNext}
            className="text-sm text-warm-stone hover:text-deep-charcoal transition-colors"
          >
            {t('onboarding.skipForNow')}
          </button>
          <button
            type="button"
            onClick={startInterview}
            className="px-6 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl flex items-center gap-2 transition-all duration-300"
          >
            <ThiingsIcon name="chat" pxSize={16} />
            {t('onboarding.startInterview')}
          </button>
        </div>
      </motion.div>
    );
  }

  // ── Researching state ──
  if (phase === 'researching') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 space-y-4"
      >
        <div className="w-12 h-12 border-3 border-burgundy/20 border-t-burgundy rounded-full animate-spin" />
        <p className="text-sm text-stone-gray">{t('onboarding.researchingRestaurant')}</p>
        <p className="text-xs text-muted-stone">{t('onboarding.researchingHint')}</p>
      </motion.div>
    );
  }

  // ── Complete state ──
  if (phase === 'complete') {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-8"
      >
        <div className="text-center py-8">
          <div className="w-20 h-20 bg-burgundy/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <ThiingsIcon name="check-circle" pxSize={40} className="text-burgundy" />
          </div>
          <h2 className="font-serif text-2xl font-bold text-deep-charcoal mb-2">
            {t('onboarding.aiKnowsRestaurant')}
          </h2>
          <p className="text-stone-gray text-sm mb-1">
            {t('onboarding.aiPersonalized')}
          </p>
          <p className="text-stone-gray text-sm">
            {t('onboarding.refineAnytime')}
          </p>
        </div>

        <button
          type="button"
          onClick={onNext}
          className="w-full px-8 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all duration-300"
        >
          {t('onboarding.goToDashboard')}
          <ThiingsIcon name="arrow-right" pxSize={20} />
        </button>
      </motion.div>
    );
  }

  // ── Generating state ──
  if (phase === 'generating') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 space-y-4"
      >
        <div className="w-12 h-12 border-3 border-burgundy/20 border-t-burgundy rounded-full animate-spin" />
        <p className="text-sm text-stone-gray">{t('onboarding.generatingPersona')}</p>
        <p className="text-xs text-muted-stone">{t('onboarding.generatingHint')}</p>
      </motion.div>
    );
  }

  // ── Chat state ──
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex flex-col h-[520px]"
    >
      {/* Header with progress */}
      <div className="flex-shrink-0 mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="font-serif text-lg font-bold text-deep-charcoal">{t('onboarding.teachAIHeading')}</h2>
          <span className="text-xs text-stone-gray">{t('onboarding.completePercent', { pct: completionPct })}</span>
        </div>
        <div className="w-full bg-soft-gray rounded-full h-1.5">
          <div
            className="bg-burgundy h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
        {currentTopic && (
          <p className="text-xs text-muted-stone mt-1">{t('onboarding.topicLabel', { topic: currentTopic })}</p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-burgundy text-white rounded-br-md'
                  : 'bg-soft-gray text-deep-charcoal rounded-bl-md'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex justify-start">
            <div className="bg-soft-gray rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-stone-gray rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-stone-gray rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-stone-gray rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Quick replies */}
      {quickReplies.length > 0 && !isSending && (
        <div className="flex-shrink-0 flex flex-wrap gap-1.5 mb-2">
          {quickReplies.map((reply, i) => (
            <button
              key={i}
              type="button"
              onClick={() => sendMessage(reply)}
              className="px-3 py-1.5 text-xs bg-white/60 backdrop-blur-glass-chip border border-glass-border-dark rounded-full text-deep-charcoal hover:bg-white/85 transition-colors"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSending}
          placeholder={t('onboarding.typeYourAnswer')}
          rows={1}
          className="flex-1 border border-glass-border-input rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy resize-none bg-white/60 placeholder:text-muted-stone transition-colors disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => sendMessage(input)}
          disabled={isSending || !input.trim()}
          className="px-3 py-2.5 bg-burgundy hover:bg-burgundy-dark disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all duration-200"
        >
          <ThiingsIcon name="send" pxSize={16} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex-shrink-0 mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          <ThiingsIcon name="alert-circle" pxSize={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Skip option */}
      <div className="flex-shrink-0 flex justify-between items-center mt-2">
        <button
          type="button"
          onClick={onNext}
          disabled={isSending}
          className="text-xs text-warm-stone hover:text-deep-charcoal transition-colors disabled:opacity-50"
        >
          {t('onboarding.skipAndFinishLater')}
        </button>
        {completionPct >= 60 && (
          <button
            type="button"
            onClick={async () => {
              setPhase('generating');
              try {
                await api.post('/restaurant-learning/generate-persona', { session_id: sessionId });
              } catch (personaErr) {
                // Best effort — transcript is saved, persona regenerable later.
                console.error('[Step6TeachAI] persona generation failed (finish early)', personaErr);
              }
              setPhase('complete');
            }}
            className="text-xs text-burgundy hover:text-burgundy-dark font-medium transition-colors"
          >
            {t('onboarding.finishEarlyGenerate')}
          </button>
        )}
      </div>
    </motion.div>
  );
}
