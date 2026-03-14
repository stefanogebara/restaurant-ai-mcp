import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import ElevenLabsWidget from '../../components/ElevenLabsWidget';

const SUGGESTIONS = [
  'Book a table for 2 tonight',
  "What's on the menu?",
  'Do you have a terrace?',
];

export default function VoiceWidgetSection() {
  const { t } = useTranslation();

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
    script.async = true;
    script.type = 'text/javascript';
    document.body.appendChild(script);
    return () => { if (document.body.contains(script)) document.body.removeChild(script); };
  }, []);

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

        {/* Right — Widget */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center"
        >
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
            <ElevenLabsWidget agentId={import.meta.env.VITE_ELEVENLABS_AGENT_ID || ''} useSignedUrl={false} />
          </div>
          <p className="mt-4 text-sm text-muted-stone">
            {t('landing.voice.micHint', 'Click the mic to start talking')}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
