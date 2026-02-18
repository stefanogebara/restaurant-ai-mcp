/**
 * ResearchLoadingState - Phase 1 Loading Animation
 *
 * Animated globe with cycling status text while the AI
 * researches the restaurant online.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ResearchLoadingStateProps {
  restaurantName: string;
  onSkip?: () => void;
}

const LOADING_MESSAGES = [
  'Searching the web for your restaurant...',
  'Reading online reviews and ratings...',
  'Analyzing your menu and specialties...',
  'Understanding your neighborhood...',
  'Gathering customer feedback...',
  'Building your restaurant profile...',
];

export default function ResearchLoadingState({ restaurantName, onSkip }: ResearchLoadingStateProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-8 md:py-12 space-y-6 md:space-y-8">
      {/* Animated Globe */}
      <div className="relative">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          className="w-24 h-24 rounded-full border-2 border-[#9F1239]/20 flex items-center justify-center"
        >
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            className="w-16 h-16 rounded-full bg-gradient-to-br from-[#9F1239]/10 to-[#9F1239]/30 flex items-center justify-center"
          >
            <svg className="w-8 h-8 text-[#9F1239]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          </motion.div>
        </motion.div>

        {/* Orbiting dots */}
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-[#9F1239]"
            style={{ top: '50%', left: '50%', translateX: '-50%', translateY: '-50%' }}
            animate={{
              x: [0, Math.cos(i * (2 * Math.PI / 3)) * 52, 0],
              y: [0, Math.sin(i * (2 * Math.PI / 3)) * 52, 0],
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.4,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Restaurant Name */}
      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-serif text-xl font-bold text-[#1C1917] text-center"
      >
        Learning about {restaurantName}
      </motion.h3>

      {/* Cycling Text */}
      <div className="h-6 relative w-full max-w-sm">
        <AnimatePresence mode="wait">
          <motion.p
            key={messageIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="text-sm text-[#57534E] text-center absolute inset-0"
          >
            {LOADING_MESSAGES[messageIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Time estimate */}
      <p className="text-xs text-[#A8A29E] text-center -mt-4">
        Usually takes 10–30 seconds
      </p>

      {/* Progress Bar - indeterminate shimmer */}
      <div className="w-full max-w-xs">
        <div className="h-1 bg-[#E7E5E4] rounded-full overflow-hidden relative">
          <motion.div
            className="absolute h-full w-1/3 bg-[#9F1239] rounded-full"
            animate={{ x: ['-100%', '400%'] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>

      {/* Inline skip during loading so users don't need to scroll */}
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-[#A8A29E] hover:text-[#57534E] font-medium transition-colors underline underline-offset-2"
        >
          Skip this step
        </button>
      )}
    </div>
  );
}
