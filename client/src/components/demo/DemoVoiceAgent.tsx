/**
 * DemoVoiceAgent
 * Full-screen Sesame-style voice agent interstitial shown after demo creation.
 * Loads ElevenLabs convai widget with personalized restaurant prompt.
 * The orb is clickable — it triggers the hidden ElevenLabs widget.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { buildDemoPrompt, buildDemoFirstMessage } from '../../utils/buildDemoPrompt';
import type { ScrapedData } from '../../utils/buildDemoPrompt';

interface DemoVoiceAgentProps {
  restaurantName: string;
  scrapedData: ScrapedData;
  onContinue: () => void;
}

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID as string | undefined;
const CONVAI_SCRIPT_SRC = '/js/convai-widget-embed.js';
const CONVAI_SCRIPT_DATA_ATTR = 'data-convai-loader';

/**
 * Loads the ElevenLabs Convai script exactly once per page. Returns a promise
 * that resolves when the script is ready, or rejects if the script tag errors.
 *
 * Previously each DemoVoiceAgent mount appended its own <script> and the
 * cleanup removed it from <body>. With multiple instances or quick
 * mount/unmount cycles (Strict Mode, parent re-render), the second mount
 * removed a script that the first instance was still using, breaking the
 * widget without any console error.
 */
let convaiScriptPromise: Promise<void> | null = null;
function loadConvaiScript(): Promise<void> {
  if (convaiScriptPromise) return convaiScriptPromise;
  convaiScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[${CONVAI_SCRIPT_DATA_ATTR}]`
    );
    if (existing) {
      // If a previous load left a script tag in the DOM, assume it's ready —
      // the convai widget defines its custom element synchronously on load.
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = CONVAI_SCRIPT_SRC;
    script.async = true;
    script.type = 'text/javascript';
    script.setAttribute(CONVAI_SCRIPT_DATA_ATTR, 'true');
    script.onload = () => resolve();
    script.onerror = () => {
      // Reset so a subsequent mount can retry from scratch.
      convaiScriptPromise = null;
      script.remove();
      reject(new Error('Failed to load ElevenLabs Convai widget script'));
    };
    document.body.appendChild(script);
  });
  return convaiScriptPromise;
}

export default function DemoVoiceAgent({ restaurantName, scrapedData, onContinue }: DemoVoiceAgentProps) {
  const { t } = useTranslation();
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLElement | null>(null);
  const [widgetLoaded, setWidgetLoaded] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [scriptError, setScriptError] = useState(false);

  // Fallback: if no agent ID, auto-continue after 3s
  useEffect(() => {
    if (!AGENT_ID) {
      const timer = setTimeout(onContinue, 3000);
      return () => clearTimeout(timer);
    }
  }, [onContinue]);

  // Load ElevenLabs widget script (once per page) and create the widget element.
  // Cleanup removes the widget element ONLY — the shared script tag is left in
  // place for subsequent mounts, preventing the cross-instance race where one
  // mount removed the script another mount was still consuming.
  useEffect(() => {
    if (!AGENT_ID) return;
    let cancelled = false;
    const containerEl = widgetContainerRef.current;

    loadConvaiScript()
      .then(() => {
        if (cancelled || !containerEl) return;
        const widget = document.createElement('elevenlabs-convai') as HTMLElement;
        widget.setAttribute('agent-id', AGENT_ID);

        const systemPrompt = buildDemoPrompt(scrapedData);
        const firstMessage = buildDemoFirstMessage(scrapedData);

        widget.setAttribute('overrides', JSON.stringify({
          agent: {
            prompt: { prompt: systemPrompt },
            first_message: firstMessage,
          },
        }));

        containerEl.appendChild(widget);
        widgetRef.current = widget;
        setWidgetLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[DemoVoiceAgent] failed to load convai widget', err);
        setScriptError(true);
      });

    return () => {
      cancelled = true;
      if (containerEl) {
        const widget = containerEl.querySelector('elevenlabs-convai');
        if (widget) containerEl.removeChild(widget);
      }
      widgetRef.current = null;
    };
  }, [scrapedData]);

  // Click the orb → programmatically trigger the ElevenLabs widget button
  const handleOrbClick = useCallback(() => {
    if (!widgetRef.current) return;

    // The convai widget renders a shadow DOM with a button inside.
    // Try to click the internal button to start/stop the conversation.
    const shadowRoot = widgetRef.current.shadowRoot;
    if (shadowRoot) {
      const btn = shadowRoot.querySelector('button') as HTMLButtonElement | null;
      if (btn) {
        btn.click();
        setIsActive(prev => !prev);
        return;
      }
    }

    // Fallback: dispatch a click on the widget element itself
    widgetRef.current.click();
    setIsActive(prev => !prev);
  }, []);

  // Pulsing ring animation variants
  const ringVariants = {
    pulse: (i: number) => ({
      scale: [1, 1.6 + i * 0.3],
      opacity: [0.4 - i * 0.08, 0],
      transition: {
        duration: 2.2 + i * 0.3,
        repeat: Infinity,
        ease: 'easeOut' as const,
        delay: i * 0.4,
      },
    }),
  };

  if (!AGENT_ID) {
    return (
      <div className="fixed inset-0 z-[100] bg-deep-charcoal flex flex-col items-center justify-center text-white">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <p className="text-lg text-white/70 mb-2">{t('demo.voice.unavailable', 'Voice preview unavailable')}</p>
          <p className="text-sm text-white/40">{t('demo.voice.redirecting', 'Redirecting to your dashboard...')}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-deep-charcoal flex flex-col items-center justify-center overflow-hidden">
      {/* Hide the default ElevenLabs floating bubble — we use the orb instead */}
      <style>{`
        .elevenlabs-demo-container elevenlabs-convai {
          position: fixed !important;
          bottom: -9999px !important;
          right: -9999px !important;
          opacity: 0 !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
        }
      `}</style>

      {/* Restaurant name */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="absolute top-8 left-0 right-0 text-center"
      >
        <p className="font-serif text-2xl font-semibold text-white tracking-tight">
          {restaurantName}<span className="text-burgundy">.</span>
        </p>
      </motion.div>

      {/* Main content */}
      <div className="flex flex-col items-center gap-8">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-center"
        >
          <h1 className="text-2xl sm:text-3xl font-serif font-medium text-white tracking-tight mb-2">
            {t('demo.voice.title', 'Meet your AI receptionist')}
          </h1>
          <p className="text-sm sm:text-base text-white/50 font-light">
            {t('demo.voice.subtitle', 'This is what your customers will hear when they call')}
          </p>
        </motion.div>

        {/* Pulsing orb — CLICKABLE */}
        <motion.button
          type="button"
          onClick={handleOrbClick}
          disabled={!widgetLoaded || scriptError}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center cursor-pointer border-0 bg-transparent focus:outline-none disabled:cursor-wait"
          aria-label={isActive ? 'Stop voice agent' : 'Start voice agent'}
        >
          {/* Pulsing rings */}
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              custom={i}
              animate="pulse"
              variants={ringVariants}
              className={`absolute inset-0 rounded-full border ${isActive ? 'border-rose-400/40' : 'border-burgundy/40'}`}
            />
          ))}

          {/* Core orb */}
          <motion.div
            animate={{
              scale: isActive ? [1, 1.1, 1] : [1, 1.05, 1],
              boxShadow: isActive
                ? [
                    '0 0 40px rgba(74, 222, 128, 0.3)',
                    '0 0 80px rgba(74, 222, 128, 0.5)',
                    '0 0 40px rgba(74, 222, 128, 0.3)',
                  ]
                : [
                    '0 0 40px rgba(128, 0, 32, 0.3)',
                    '0 0 60px rgba(128, 0, 32, 0.5)',
                    '0 0 40px rgba(128, 0, 32, 0.3)',
                  ],
            }}
            transition={{ duration: isActive ? 1.5 : 3, repeat: Infinity, ease: 'easeInOut' }}
            className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center transition-colors duration-500 ${
              isActive
                ? 'bg-gradient-to-br from-rose-500 to-rose-700'
                : 'bg-gradient-to-br from-burgundy to-burgundy-dark'
            }`}
          >
            {isActive ? (
              /* Stop icon */
              <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white/90" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              /* Mic icon */
              <svg
                className="w-10 h-10 sm:w-12 sm:h-12 text-white/90"
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
            )}
          </motion.div>
        </motion.button>

        {/* Status indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/[6%] rounded-full"
        >
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isActive ? 'bg-rose-400' : 'bg-rose-400'} opacity-75`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isActive ? 'bg-rose-500' : 'bg-rose-500'}`} />
          </span>
          <span className="text-xs font-medium text-white/70">
            {scriptError
              ? t('demo.voice.error', 'Voice agent unavailable')
              : !widgetLoaded
                ? t('demo.voice.loading', 'Loading voice agent...')
                : isActive
                  ? t('demo.voice.listening', 'Listening... tap orb to stop')
                  : t('demo.voice.tapToStart', 'Tap the orb to start talking')
            }
          </span>
        </motion.div>
      </div>

      {/* Hidden ElevenLabs widget container */}
      <div ref={widgetContainerRef} className="elevenlabs-demo-container" />

      {/* Skip link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="absolute bottom-8 left-0 right-0 text-center"
      >
        <button
          type="button"
          onClick={onContinue}
          className="text-sm text-white/40 hover:text-white/70 transition-colors font-light"
        >
          {t('demo.voice.skipToDashboard', 'Skip to dashboard')} &rarr;
        </button>
      </motion.div>
    </div>
  );
}
