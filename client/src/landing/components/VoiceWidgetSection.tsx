import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import ElevenLabsWidget from '../../components/ElevenLabsWidget';

const ELEVENLABS_SCRIPT_URL = '/js/convai-widget-embed.js';

const SUGGESTION_KEYS = [
  { key: 'landing.voice.suggestion1', fallback: 'Book a table for 2 tonight' },
  { key: 'landing.voice.suggestion2', fallback: "What's on the menu?" },
  { key: 'landing.voice.suggestion3', fallback: 'Do you have a terrace?' },
];

/** Pulsing ring animation — concentric ripples radiating from the orb center */
const ringVariants = {
  pulse: (i: number) => ({
    scale: [1, 1.5 + i * 0.25],
    opacity: [0.35 - i * 0.07, 0],
    transition: {
      duration: 2.4 + i * 0.3,
      repeat: Infinity,
      ease: 'easeOut' as const,
      delay: i * 0.4,
    },
  }),
};

export default function VoiceWidgetSection() {
  const { t } = useTranslation();
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  const agentId = import.meta.env.VITE_ELEVENLABS_AGENT_ID || '';

  useEffect(() => {
    if (!agentId) {
      setScriptError(true);
      return;
    }

    const script = document.createElement('script');
    script.src = ELEVENLABS_SCRIPT_URL;
    script.async = true;
    script.type = 'text/javascript';
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => setScriptError(true);
    document.body.appendChild(script);
    return () => { if (document.body.contains(script)) document.body.removeChild(script); };
  }, [agentId]);

  return (
    <section className="py-24 sm:py-32 px-6 bg-[#1a1a2e] overflow-hidden">
      <div className="max-w-3xl mx-auto flex flex-col items-center text-center">
        {/* Label */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-4"
        >
          {t('landing.voice.label', 'Try it live')}
        </motion.div>

        {/* Heading */}
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="font-serif text-3xl sm:text-[44px] font-medium tracking-tight text-white leading-tight mb-3"
        >
          {t('landing.voice.heading', 'Call our AI host')}
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="text-base sm:text-lg text-white/50 font-light leading-relaxed max-w-xl mb-12"
        >
          {t('landing.voice.subtitle', 'Have a real conversation. Ask to book a table for 4 tonight \u2014 and hear the AI respond naturally.')}
        </motion.p>

        {/* ── Orb + Widget Card ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="relative w-full max-w-md rounded-3xl bg-white/[5%] backdrop-blur-sm border border-white/[8%] p-8 sm:p-10 flex flex-col items-center"
        >
          {scriptError ? (
            /* ── Fallback ── */
            <div className="flex flex-col items-center gap-5">
              <div className="w-20 h-20 rounded-full bg-burgundy/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-9 h-9 text-burgundy" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.09 5.18 2 2 0 0 1 5.11 3h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.34a2 2 0 0 1-.45 2.11L8.91 10.6a16 16 0 0 0 6.49 6.49l1.43-1.43a2 2 0 0 1 2.11-.45c.74.32 1.53.55 2.34.68A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <div>
                <h3 className="font-serif text-lg font-semibold text-white mb-1">
                  {t('landing.voice.fallbackTitle', 'Voice demo unavailable')}
                </h3>
                <p className="text-sm text-white/40 mb-5">
                  {t('landing.voice.fallbackDesc', 'Try our WhatsApp AI instead \u2014 send a message and get an instant response.')}
                </p>
              </div>
              <a
                href={`https://wa.me/551150289356?text=${encodeURIComponent(t('landing.whatsapp.previewMessage', "Hi! I'd like to book a table for 4 tomorrow at 8pm"))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-whatsapp hover:bg-whatsapp/90 text-white text-sm font-semibold rounded-full transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {t('landing.whatsapp.cta', 'Send a test message')} &rarr;
              </a>
            </div>
          ) : (
            <>
              {/* ── Pulsing orb ── */}
              <div className="relative w-44 h-44 sm:w-52 sm:h-52 flex items-center justify-center mb-6">
                {/* Concentric ripple rings */}
                {[0, 1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    custom={i}
                    animate="pulse"
                    variants={ringVariants}
                    className="absolute inset-0 rounded-full border border-burgundy/30"
                  />
                ))}

                {/* Core orb */}
                <motion.div
                  animate={{
                    scale: [1, 1.04, 1],
                    boxShadow: [
                      '0 0 40px rgba(159, 18, 57, 0.25)',
                      '0 0 70px rgba(159, 18, 57, 0.45)',
                      '0 0 40px rgba(159, 18, 57, 0.25)',
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-burgundy to-burgundy-dark flex items-center justify-center"
                >
                  <svg
                    className="w-10 h-10 sm:w-11 sm:h-11 text-white/90"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </motion.div>
              </div>

              {/* Online indicator */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/[6%] rounded-full mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-xs font-medium text-white/60">
                  {scriptLoaded
                    ? t('landing.voice.micHint', 'Click the mic to start talking')
                    : t('landing.voice.loading', 'Loading voice agent...')}
                </span>
              </div>

              {/* ElevenLabs widget */}
              <div className="w-full rounded-2xl bg-white/[4%] border border-white/[6%] p-4">
                {scriptLoaded ? (
                  <ElevenLabsWidget agentId={agentId} useSignedUrl={false} />
                ) : (
                  <div className="flex items-center justify-center h-16 text-sm text-white/30">
                    {t('landing.voice.loading', 'Loading voice agent...')}
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>

        {/* ── Suggestion chips ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex flex-wrap justify-center gap-2 mt-8"
        >
          {SUGGESTION_KEYS.map((s) => (
            <span
              key={s.key}
              className="px-4 py-1.5 rounded-full border border-white/10 text-sm text-white/50 bg-white/[3%]"
            >
              {t(s.key, s.fallback)}
            </span>
          ))}
        </motion.div>

        {/* Powered-by */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-xs text-white/25 mt-5"
        >
          {t('landing.voice.powered', 'Powered by ElevenLabs \u00b7 English, Portuguese, Spanish')}
        </motion.p>
      </div>
    </section>
  );
}
