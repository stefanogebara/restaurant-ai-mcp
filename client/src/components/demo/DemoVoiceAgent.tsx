/**
 * DemoVoiceAgent
 * Full-screen Sesame-style voice agent interstitial shown after demo creation.
 * Loads ElevenLabs convai widget with personalized restaurant prompt.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { buildDemoPrompt, buildDemoFirstMessage } from '../../utils/buildDemoPrompt';
import type { ScrapedData } from '../../utils/buildDemoPrompt';

interface DemoVoiceAgentProps {
  restaurantName: string;
  scrapedData: ScrapedData;
  onContinue: () => void;
}

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID as string | undefined;

export default function DemoVoiceAgent({ restaurantName, scrapedData, onContinue }: DemoVoiceAgentProps) {
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const [widgetLoaded, setWidgetLoaded] = useState(false);

  // Fallback: if no agent ID, auto-continue after 3s
  useEffect(() => {
    if (!AGENT_ID) {
      const timer = setTimeout(onContinue, 3000);
      return () => clearTimeout(timer);
    }
  }, [onContinue]);

  // Load ElevenLabs widget script and create element
  useEffect(() => {
    if (!AGENT_ID) return;

    const script = document.createElement('script');
    script.src = '/js/convai-widget-embed.js';
    script.async = true;
    script.type = 'text/javascript';

    script.onload = () => {
      if (!widgetContainerRef.current) return;

      const widget = document.createElement('elevenlabs-convai');
      widget.setAttribute('agent-id', AGENT_ID);

      const systemPrompt = buildDemoPrompt(scrapedData);
      const firstMessage = buildDemoFirstMessage(scrapedData);

      widget.setAttribute('overrides', JSON.stringify({
        agent: {
          prompt: { prompt: systemPrompt },
          first_message: firstMessage,
        },
      }));

      widgetContainerRef.current.appendChild(widget);
      setWidgetLoaded(true);
    };

    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
      // Clean up widget element
      if (widgetContainerRef.current) {
        const widget = widgetContainerRef.current.querySelector('elevenlabs-convai');
        if (widget) {
          widgetContainerRef.current.removeChild(widget);
        }
      }
    };
  }, [scrapedData]);

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
      <div className="fixed inset-0 z-[100] bg-[#1a1a2e] flex flex-col items-center justify-center text-white">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <p className="text-lg text-white/70 mb-2">Voice preview unavailable</p>
          <p className="text-sm text-white/40">Redirecting to your dashboard...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#1a1a2e] flex flex-col items-center justify-center overflow-hidden">
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
            Meet your AI receptionist
          </h1>
          <p className="text-sm sm:text-base text-white/50 font-light">
            This is what your customers will hear when they call
          </p>
        </motion.div>

        {/* Pulsing orb */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center"
        >
          {/* Pulsing rings */}
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              custom={i}
              animate="pulse"
              variants={ringVariants}
              className="absolute inset-0 rounded-full border border-burgundy/40"
            />
          ))}

          {/* Core orb */}
          <motion.div
            animate={{
              scale: [1, 1.05, 1],
              boxShadow: [
                '0 0 40px rgba(128, 0, 32, 0.3)',
                '0 0 60px rgba(128, 0, 32, 0.5)',
                '0 0 40px rgba(128, 0, 32, 0.3)',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-burgundy to-burgundy-dark flex items-center justify-center"
          >
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
          </motion.div>
        </motion.div>

        {/* Online indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/[6%] rounded-full"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-xs font-medium text-white/70">
            {widgetLoaded ? 'Click the widget below to start talking' : 'Loading voice agent...'}
          </span>
        </motion.div>
      </div>

      {/* ElevenLabs widget container */}
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
          Skip to dashboard &rarr;
        </button>
      </motion.div>
    </div>
  );
}
