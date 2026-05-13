import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import VoiceOrb from '../components/voice/VoiceOrb';
import { useVoiceAgent } from '../components/voice/useVoiceAgent';
import VoiceDemoDashboard from './VoiceDemoDashboard';
import type { MockReservation } from './VoiceDemoDashboard';

/** Parse agent messages for reservation keywords.
 *  Multilingual — Sofia speaks PT-BR by default for Brazilian prospects, so
 *  we have to recognise PT/ES confirmation patterns too. Without these the
 *  live demo dashboard stayed empty whenever the agent confirmed in PT, which
 *  killed the "magic real-time" effect for our primary market. */
const CONFIRMED_KEYWORDS = [
  // English
  'confirmed', 'booked', 'reserved',
  // Portuguese
  'confirmada', 'confirmado', 'reservado', 'reservada', 'marcada', 'marcado', 'reservei', 'agendada', 'agendado',
  // Spanish
  'confirmada', 'reservada', 'reservado', 'agendada', 'reservé',
];

const CANCELLED_KEYWORDS = [
  // English
  'cancelled', 'canceled',
  // Portuguese
  'cancelada', 'cancelado', 'cancelei',
  // Spanish
  'cancelada', 'cancelado', 'cancelé',
];

const NAME_RE = /(?:for|name[:\s]+|para|nombre[:\s]+|nome[:\s]+|em nome de|a nombre de)\s*([A-Z][a-záéíóúñãõâêôç]+(?:\s[A-Z][a-záéíóúñãõâêôç]*)?)/i;
const SIZE_RE = /(?:table for|party of|for|para|mesa para|mesa de|reserva para)\s*(\d+)\s*(?:people|pessoas?|personas?|guests?)?/i;
const TIME_RE = /(\d{1,2}(?::\d{2})?\s*(?:pm|am|h|horas?)?)/i;

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some(n => haystack.includes(n));
}

function parseReservationFromText(text: string): MockReservation | null {
  const lower = text.toLowerCase();

  if (containsAny(lower, CONFIRMED_KEYWORDS)) {
    const nameMatch = text.match(NAME_RE);
    const name = nameMatch?.[1] || 'Guest';
    const sizeMatch = text.match(SIZE_RE);
    const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 2;
    const timeMatch = text.match(TIME_RE);
    const time = timeMatch?.[1] || '20:00';

    return {
      id: `voice-${Date.now()}`,
      name,
      time,
      size,
      status: 'confirmed',
      isNew: true,
    };
  }

  if (containsAny(lower, CANCELLED_KEYWORDS)) {
    const nameMatch = text.match(NAME_RE);
    return {
      id: `voice-cancel-${Date.now()}`,
      name: nameMatch?.[1] || 'Guest',
      time: '',
      size: 0,
      status: 'cancelled',
      isNew: true,
    };
  }

  return null;
}

export default function LiveAIDemo() {
  const { t } = useTranslation();
  useDocumentTitle(t('pageTitles.voiceDemo'));
  const agentId = import.meta.env.VITE_ELEVENLABS_AGENT_ID || '';

  // Catch config drift early: if the env var is missing in production, the
  // orb silently no-ops on click. Log so Sentry surfaces the misconfig.
  useEffect(() => {
    if (!agentId) {
      console.error('[LiveAIDemo] VITE_ELEVENLABS_AGENT_ID is unset — voice demo will not start');
    }
  }, [agentId]);

  const {
    agentState,
    error,
    transcript,
    toggle,
    confirmStart,
    cancelStart,
    getInputVolume,
    getOutputVolume,
  } = useVoiceAgent({ agentId, useSignedUrl: false, requireConfirmation: true });

  const [liveReservations, setLiveReservations] = useState<MockReservation[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processedRef = useRef(new Set<string>());

  const isActive = agentState !== 'idle' && agentState !== 'connecting' && agentState !== 'ready';

  // Call timer
  useEffect(() => {
    if (isActive) {
      setCallDuration(0);
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  // Watch transcript for reservation confirmations
  useEffect(() => {
    for (const msg of transcript) {
      if (msg.role !== 'agent') continue;
      if (processedRef.current.has(msg.text)) continue;
      processedRef.current.add(msg.text);

      const reservation = parseReservationFromText(msg.text);
      if (reservation) {
        setLiveReservations((prev) => [reservation, ...prev]);
      }
    }
  }, [transcript]);

  // Surface voice-agent errors to Sentry. The error string is already rendered
  // inline to the user, but without logging an ElevenLabs outage or signed-URL
  // backend break would never appear in telemetry.
  useEffect(() => {
    if (error) console.error('[LiveAIDemo] voice agent error', error);
  }, [error]);

  const handleOrbClick = useCallback(() => {
    if (!agentId) return;
    toggle();
  }, [agentId, toggle]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* Minimal top bar */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/[5%]">
        <Link
          to="/"
          className="font-serif text-xl font-semibold text-white/90 tracking-tight"
        >
          seatable<span className="text-burgundy">.</span>
        </Link>
        <Link
          to="/"
          className="text-sm text-white/40 hover:text-white/60 transition-colors"
        >
          {t('landing.voiceDemo.backToSite', '\u2190 Back')}
        </Link>
      </nav>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-16 px-6 py-8 lg:py-0">
        {/* Left: Voice Orb + Controls */}
        <div className="flex flex-col items-center gap-6 max-w-md w-full">
          {/* Restaurant info */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-2"
          >
            <h1 className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-white/90 mb-1">
              {t('landing.voiceDemo.title', 'Talk to our AI host')}
            </h1>
            <p className="text-sm text-white/35 font-light">
              {t('landing.voiceDemo.subtitle', 'Ask to book a table, check availability, or inquire about the menu')}
            </p>
          </motion.div>

          {/* The Orb */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            <VoiceOrb
              agentState={agentState}
              getInputVolume={getInputVolume}
              getOutputVolume={getOutputVolume}
              onClick={handleOrbClick}
              size={220}
              labels={{
                idle: t('landing.voice.tapToTalk', 'Tap to talk'),
                connecting: t('landing.voice.connecting', 'Connecting...'),
                listening: t('landing.voice.listening', 'Listening...'),
                thinking: t('landing.voice.thinking', 'Thinking...'),
                talking: t('landing.voice.speaking', 'Speaking...'),
              }}
            />
          </motion.div>

          {/* Ready to call? confirmation */}
          <AnimatePresence>
            {agentState === 'ready' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex flex-col items-center gap-3"
              >
                <p className="text-sm text-white/50">
                  {t('landing.voiceDemo.readyPrompt', 'This will use your microphone to talk with our AI host.')}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={confirmStart}
                    className="flex items-center gap-2 px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium rounded-full transition-colors"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.09 5.18 2 2 0 0 1 5.11 3h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.34a2 2 0 0 1-.45 2.11L8.91 10.6a16 16 0 0 0 6.49 6.49l1.43-1.43a2 2 0 0 1 2.11-.45c.74.32 1.53.55 2.34.68A2 2 0 0 1 22 16.92z" />
                    </svg>
                    {t('landing.voiceDemo.startCall', 'Start call')}
                  </button>
                  <button
                    type="button"
                    onClick={cancelStart}
                    className="px-5 py-2.5 text-white/40 hover:text-white/60 text-sm font-medium rounded-full transition-colors"
                  >
                    {t('landing.voiceDemo.cancel', 'Cancel')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Call controls — visible when active */}
          <AnimatePresence>
            {isActive && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex items-center gap-6"
              >
                <span className="text-sm text-white/40 font-mono tabular-nums">
                  {formatTime(callDuration)}
                </span>
                <button
                  type="button"
                  onClick={toggle}
                  className="flex items-center gap-2 px-5 py-2 bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium rounded-full transition-colors"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.09 5.18 2 2 0 0 1 5.11 3h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.34a2 2 0 0 1-.45 2.11L8.91 10.6a16 16 0 0 0 6.49 6.49l1.43-1.43a2 2 0 0 1 2.11-.45c.74.32 1.53.55 2.34.68A2 2 0 0 1 22 16.92z" />
                  </svg>
                  {t('landing.voiceDemo.endCall', 'End call')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* H9: Mid-call CTA — appears after the call has been going for 12s
              (long enough that the prospect heard a real interaction). This is
              the highest-engagement moment in the funnel; previously the only
              CTA was the bottom-bar link visible after the call ended. */}
          <AnimatePresence>
            {isActive && callDuration >= 12 && (
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.3 }}
                className="w-full max-w-sm"
              >
                <Link
                  to="/demo/setup"
                  className="block bg-gradient-to-r from-burgundy to-rose-600 hover:from-burgundy-dark hover:to-rose-500 text-white rounded-2xl px-5 py-4 transition-all shadow-lg shadow-burgundy/20"
                >
                  <div className="text-[11px] uppercase tracking-wider text-white/70 mb-0.5">
                    {t('landing.voiceDemo.midCallCtaLabel', 'This could be YOUR restaurant')}
                  </div>
                  <div className="text-sm font-semibold flex items-center justify-between gap-2">
                    <span>{t('landing.voiceDemo.midCallCta', 'Set up your AI in 2 minutes — free')}</span>
                    <span aria-hidden>&rarr;</span>
                  </div>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Config drift: env var unset (production misconfig). Visible so
              users don't sit tapping a dead orb wondering why nothing happens. */}
          {!agentId && (
            <p className="text-sm text-amber-300/80 text-center max-w-xs">
              {t('landing.voiceDemo.unavailable', 'The voice demo is temporarily unavailable. Please try again in a few minutes.')}
            </p>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400/80 text-center max-w-xs">{error}</p>
          )}

          {/* L3: tell mobile users the live dashboard is desktop-only — the
              magic real-time moment is hidden behind `lg:block`. */}
          <p className="lg:hidden text-xs text-white/30 text-center max-w-xs italic">
            {t('landing.voiceDemo.liveDashboardMobileHint', 'Open this on desktop to watch reservations appear in real-time during your call.')}
          </p>

          {/* Transcript */}
          <AnimatePresence>
            {transcript.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="w-full max-w-sm space-y-2 max-h-48 overflow-y-auto"
              >
                {transcript.slice(-5).map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`text-sm px-3 py-2 rounded-xl ${
                      msg.role === 'user'
                        ? 'bg-white/[6%] text-white/60 ml-8 rounded-br-sm'
                        : 'bg-burgundy/15 text-white/70 mr-8 rounded-bl-sm'
                    }`}
                  >
                    {msg.text}
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Live Dashboard — desktop only */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="hidden lg:block"
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
            <span className="text-xs text-white/30">
              {t('landing.voiceDemo.liveDashboard', 'Live dashboard \u2014 reservations appear in real-time')}
            </span>
          </div>
          <VoiceDemoDashboard reservations={liveReservations} />
        </motion.div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[5%] px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-white/20">
          {t('landing.voiceDemo.powered', 'Powered by ElevenLabs \u00b7 Seatable AI')}
        </p>
        <div className="flex items-center gap-4">
          <Link
            to="/demo?preset=italian"
            className="text-xs text-burgundy hover:text-burgundy/80 transition-colors font-medium"
          >
            {t('landing.voiceDemo.tryDashboard', 'Try the full dashboard')} &rarr;
          </Link>
          <Link
            to="/#pricing"
            className="text-xs text-white/30 hover:text-white/50 transition-colors"
          >
            {t('landing.voiceDemo.pricing', 'Pricing')}
          </Link>
        </div>
      </div>
    </div>
  );
}
