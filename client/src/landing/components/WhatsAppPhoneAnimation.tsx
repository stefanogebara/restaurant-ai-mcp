import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface WhatsAppPhoneAnimationProps {
  onMessageStep?: (step: number) => void;
  className?: string;
}

interface ChatMessage {
  from: 'customer' | 'ai';
  text: string;
}

function useMessages(): ChatMessage[] {
  const { t } = useTranslation();
  return [
    { from: 'customer', text: t('landing.heroChat.msg1', 'Hi! Table for 4 tomorrow at 8pm?') },
    { from: 'ai', text: t('landing.heroChat.msg2', 'Of course! I have a lovely table available at 8pm. Name for the reservation?') },
    { from: 'customer', text: t('landing.heroChat.msg3', 'Maria Santos') },
    { from: 'ai', text: t('landing.heroChat.msg4', 'Perfect! Table for 4, tomorrow at 8pm. Confirmed \u2713 See you soon, Maria!') },
  ];
}

const MESSAGE_DELAY = 1500;
const TYPING_DURATION = 800;
const LOOP_PAUSE = 4000;

function TypingIndicator() {
  return (
    <div className="flex items-start">
      <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm flex gap-1 items-center">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block w-1.5 h-1.5 rounded-full bg-warm-stone"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isCustomer = message.from === 'customer';

  return (
    <motion.div
      className={`flex ${isCustomer ? 'justify-end' : 'justify-start'}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div
        className={`max-w-[85%] px-3 py-2 shadow-sm text-[13px] leading-relaxed ${
          isCustomer
            ? 'bg-rose-100 rounded-2xl rounded-tr-sm text-deep-charcoal'
            : 'bg-white rounded-2xl rounded-tl-sm text-deep-charcoal'
        }`}
      >
        {message.text}
      </div>
    </motion.div>
  );
}

export default function WhatsAppPhoneAnimation({
  onMessageStep,
  className = '',
}: WhatsAppPhoneAnimationProps) {
  const { t } = useTranslation();
  const messages = useMessages();
  const [visibleMessages, setVisibleMessages] = useState<number[]>([]);
  const [showTyping, setShowTyping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefersReducedMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Keep `onMessageStep` in a ref so a fresh parent callback identity does
  // NOT restart the entire animation loop. The previous version listed
  // `onMessageStep` in the effect deps, so every parent re-render that didn't
  // memoize the callback would tear down and rebuild the whole sequence.
  const onMessageStepRef = useRef(onMessageStep);
  useEffect(() => {
    onMessageStepRef.current = onMessageStep;
  }, [onMessageStep]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (prefersReducedMotion.current) {
      setVisibleMessages([0, 1, 2, 3]);
      return;
    }

    let cancelled = false;

    async function sleep(ms: number) {
      return new Promise<void>((resolve) => {
        timerRef.current = setTimeout(resolve, ms);
      });
    }

    async function runLoop() {
      while (!cancelled) {
        setVisibleMessages([]);
        setShowTyping(false);

        for (let i = 0; i < messages.length; i++) {
          if (cancelled) return;

          if (messages[i].from === 'ai') {
            setShowTyping(true);
            await sleep(TYPING_DURATION);
            if (cancelled) return;
            setShowTyping(false);
          }

          setVisibleMessages((prev) => [...prev, i]);
          onMessageStepRef.current?.(i);

          if (i < messages.length - 1) {
            await sleep(MESSAGE_DELAY);
          }
        }

        if (cancelled) return;
        await sleep(LOOP_PAUSE);
      }
    }

    runLoop();

    return () => {
      cancelled = true;
      clearTimer();
    };
    // `messages` is a stable array of strings re-derived from t() — t is
    // referentially stable per language. The animation should only restart
    // on language change, which is implicit through `messages` content.
    // `onMessageStep` is intentionally NOT a dep — we read it via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTimer]);

  return (
    <div
      aria-hidden="true"
      className={`w-[280px] sm:w-[320px] select-none ${className}`}
    >
      {/* Phone frame */}
      <div className="bg-deep-charcoal rounded-[2.5rem] p-2.5 shadow-2xl">
        {/* Screen */}
        <div className="bg-soft-gray rounded-[2rem] overflow-hidden flex flex-col max-h-[520px]">
          {/* Notch */}
          <div className="flex justify-center pt-2 pb-1 bg-[#075E54]">
            <div className="w-24 h-5 bg-deep-charcoal rounded-full" />
          </div>

          {/* WhatsApp header */}
          <div className="bg-[#075E54] px-4 pb-3 pt-1 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-burgundy flex items-center justify-center">
              <svg viewBox="0 0 32 32" className="w-6 h-6" aria-label="Seatable">
                <text x="6" y="24" fontFamily="Georgia, 'Palatino Linotype', serif" fontSize="22" fontWeight="700" fill="white">S</text>
                <circle cx="24" cy="22" r="3" fill="white" opacity="0.6" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-white text-sm font-semibold leading-tight">
                Seatable AI
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-whatsapp inline-block" />
                <span className="text-white/70 text-[11px]">online</span>
              </div>
            </div>
          </div>

          {/* Chat area */}
          <div
            className="flex-1 px-3 py-3 space-y-2 overflow-hidden"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 80%, #e8e5e0 0%, #ede9e3 100%)',
            }}
          >
            <AnimatePresence mode="sync">
              {visibleMessages.map((idx) => (
                <ChatBubble key={`${idx}-${visibleMessages.length}`} message={messages[idx]} />
              ))}
            </AnimatePresence>

            {showTyping && <TypingIndicator />}
          </div>

          {/* Input bar */}
          <div className="bg-soft-gray px-3 py-2 flex items-center gap-2 border-t border-border-gray">
            <div className="flex-1 bg-white rounded-full px-4 py-2 text-[12px] text-muted-stone">
              {t('landing.heroChat.inputPlaceholder', 'Type a message...')}
            </div>
            <div className="w-8 h-8 rounded-full bg-whatsapp flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 text-white"
                fill="currentColor"
              >
                <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
