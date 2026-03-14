import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import ElevenLabsWidget from '../../components/ElevenLabsWidget';

const SUGGESTIONS = [
  'Book a table for 2 tonight',
  "What's on the menu?",
  'Do you have a terrace?',
];

const ELEVENLABS_SCRIPT_URL = 'https://unpkg.com/@elevenlabs/convai-widget-embed@0.0.5';

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
    script.integrity = 'sha384-bXCYeZFO48oeemxAoIkbF3wTkdbbJT99316+t9hWOAAgfvqL9bkWuBQLb5pjSV3v';
    script.crossOrigin = 'anonymous';
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => setScriptError(true);
    document.body.appendChild(script);
    return () => { if (document.body.contains(script)) document.body.removeChild(script); };
  }, [agentId]);

  return (
    <section className="py-24 px-6 bg-warm-white">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        {/* Left — Copy */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-4">
            {t('landing.voice.label', 'Try it live')}
          </div>
          <h2 className="font-serif text-[40px] font-medium tracking-tight text-deep-charcoal leading-tight mb-4">
            {t('landing.voice.heading', 'Call our AI host')}
          </h2>
          <p className="text-lg text-warm-stone font-light leading-relaxed mb-8">
            {t('landing.voice.subtitle', 'Have a real conversation. Ask to book a table for 4 tonight — and hear the AI respond naturally.')}
          </p>
          <div className="flex flex-wrap gap-2 mb-6">
            {SUGGESTIONS.map((s) => (
              <span key={s} className="px-4 py-1.5 rounded-full border border-border-gray text-sm text-deep-charcoal">
                {s}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-stone">
            {t('landing.voice.powered', 'Powered by ElevenLabs · English, Portuguese, Spanish')}
          </p>
        </motion.div>

        {/* Right — Widget or Fallback */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center"
        >
          {scriptError ? (
            /* Fallback when widget can't load */
            <div className="w-full max-w-sm rounded-2xl bg-soft-gray border border-border-gray p-8 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-burgundy/10 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-7 h-7 text-burgundy" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.09 5.18 2 2 0 0 1 5.11 3h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.34a2 2 0 0 1-.45 2.11L8.91 10.6a16 16 0 0 0 6.49 6.49l1.43-1.43a2 2 0 0 1 2.11-.45c.74.32 1.53.55 2.34.68A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <h3 className="font-serif text-lg font-semibold text-deep-charcoal mb-2">
                {t('landing.voice.fallbackTitle', 'Voice demo unavailable')}
              </h3>
              <p className="text-sm text-muted-stone mb-4">
                {t('landing.voice.fallbackDesc', 'Try our WhatsApp AI instead — send a message and get an instant response.')}
              </p>
              <a
                href="https://wa.me/551150289356?text=Hi!%20I%27d%20like%20to%20book%20a%20table"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-whatsapp hover:bg-whatsapp/90 text-white text-sm font-semibold rounded-full transition-colors"
              >
                {t('landing.whatsapp.cta', 'Send a test message')} &rarr;
              </a>
            </div>
          ) : (
            <>
              {/* Pulse icon */}
              <div className="relative w-16 h-16 mb-6">
                <div className="absolute inset-0 rounded-full bg-burgundy/10 animate-ping" />
                <div className="absolute inset-2 rounded-full bg-burgundy/20 animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-7 h-7 text-burgundy" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.09 5.18 2 2 0 0 1 5.11 3h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.34a2 2 0 0 1-.45 2.11L8.91 10.6a16 16 0 0 0 6.49 6.49l1.43-1.43a2 2 0 0 1 2.11-.45c.74.32 1.53.55 2.34.68A2 2 0 0 1 22 16.92z" />
                  </svg>
                </div>
              </div>

              {/* Widget container */}
              <div className="w-full max-w-sm rounded-2xl bg-soft-gray border border-border-gray p-6">
                {scriptLoaded ? (
                  <ElevenLabsWidget agentId={agentId} useSignedUrl={false} />
                ) : (
                  <div className="flex items-center justify-center h-24 text-sm text-muted-stone">
                    {t('landing.voice.loading', 'Loading voice agent...')}
                  </div>
                )}
              </div>
              <p className="mt-4 text-sm text-muted-stone">
                {t('landing.voice.micHint', 'Click the mic to start talking')}
              </p>
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
}
