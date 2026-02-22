/**
 * ResearchLoadingState - Phase 1 Loading Animation
 *
 * Animated globe with cycling status text while the AI
 * researches the restaurant online.
 *
 * Accessibility: entire section carries role="status" and aria-live="polite"
 * so screen readers announce the loading context without interrupting.
 * The animation respects prefers-reduced-motion.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ResearchLoadingStateProps {
  restaurantName: string;
  onSkip?: () => void;
}

const LOADING_MESSAGES = [
  'Searching the web for your restaurant\u2026',
  'Reading online reviews and ratings\u2026',
  'Analysing your menu and specialties\u2026',
  'Understanding your neighbourhood\u2026',
  'Gathering customer feedback\u2026',
  'Building your restaurant profile\u2026',
];

/** Evenly distributed positions on a circle of radius r */
function orbitPosition(index: number, total: number, r: number): { x: number; y: number } {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

export default function ResearchLoadingState({ restaurantName, onSkip }: ResearchLoadingStateProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={`Researching ${restaurantName}. ${LOADING_MESSAGES[messageIndex]}`}
      className="flex flex-col items-center justify-center py-10 md:py-14 space-y-6"
    >
      {/* Animated Globe */}
      <div className="relative w-24 h-24 flex-shrink-0" aria-hidden="true">
        {/* Outer ring — slow clockwise rotation */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full border-2 border-dashed border-burgundy/25"
        />

        {/* Inner filled circle */}
        <div className="absolute inset-3 rounded-full bg-gradient-to-br from-burgundy/10 to-burgundy/25 flex items-center justify-center shadow-inner">
          <svg className="w-8 h-8 text-burgundy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
        </div>

        {/* Orbiting dots — three evenly spaced, staggered pulse */}
        {[0, 1, 2].map(i => {
          const start = orbitPosition(i, 3, 44);
          const mid = orbitPosition(i + 1, 3, 44);
          const end = orbitPosition(i + 2, 3, 44);
          return (
            <motion.div
              key={i}
              className="absolute w-2.5 h-2.5 rounded-full bg-burgundy shadow-sm"
              style={{
                top: '50%',
                left: '50%',
                marginTop: '-5px',
                marginLeft: '-5px',
              }}
              animate={{
                x: [start.x, mid.x, end.x, start.x],
                y: [start.y, mid.y, end.y, start.y],
                opacity: [0.5, 1, 0.5, 0.5],
                scale: [0.8, 1.1, 0.8, 0.8],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                delay: i * 1,
                ease: 'easeInOut',
              }}
            />
          );
        })}
      </div>

      {/* Restaurant Name */}
      <motion.h3
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="font-serif text-xl font-bold text-deep-charcoal text-center px-4"
      >
        Learning about {restaurantName}
      </motion.h3>

      {/* Cycling status text — fixed height prevents layout shift */}
      <div className="h-8 relative w-full max-w-xs px-4" aria-hidden="true">
        <AnimatePresence mode="wait">
          <motion.p
            key={messageIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="text-sm text-stone-gray text-center absolute inset-x-4"
          >
            {LOADING_MESSAGES[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Time estimate */}
      <p className="text-xs text-muted-stone text-center">
        Usually takes 10&ndash;30 seconds
      </p>

      {/* Indeterminate progress bar */}
      <div className="w-full max-w-xs px-4" role="progressbar" aria-label="Research in progress" aria-valuemin={0} aria-valuemax={100}>
        <div className="h-1.5 bg-border-gray rounded-full overflow-hidden">
          <motion.div
            className="h-full w-2/5 bg-gradient-to-r from-burgundy/60 to-burgundy rounded-full"
            animate={{ x: ['-110%', '280%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Inline skip */}
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-muted-stone hover:text-stone-gray font-medium transition-colors underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-burgundy focus:ring-offset-2 rounded"
        >
          Skip this step
        </button>
      )}
    </section>
  );
}
