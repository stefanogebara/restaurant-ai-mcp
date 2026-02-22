/**
 * ChatMessage - Individual Chat Bubble
 *
 * AI messages appear on the left with a light warm-stone background.
 * User messages appear on the right with burgundy background and white text.
 *
 * Accessibility:
 * - Each message is rendered inside a plain <div> within the parent role="log".
 *   The log's aria-live="polite" handles announcement; individual role="article"
 *   on chat bubbles is semantically incorrect so it is omitted.
 * - aria-label on the wrapper conveys authorship to screen readers.
 */

import { motion } from 'framer-motion';
import type { InterviewMessage } from '../../../types/restaurant-learning.types';

interface ChatMessageProps {
  message: InterviewMessage;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {/* AI avatar dot — visual anchor for AI messages */}
      {!isUser && (
        <div
          className="flex-shrink-0 w-6 h-6 rounded-full bg-burgundy/10 border border-burgundy/20 flex items-center justify-center mr-2 mt-1"
          aria-hidden="true"
        >
          <svg className="w-3 h-3 text-burgundy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
      )}

      <div
        aria-label={isUser ? 'Your message' : 'AI assistant message'}
        className={`
          max-w-[78%] sm:max-w-[72%] px-4 py-2.5 text-sm leading-relaxed break-words
          ${isUser
            ? 'bg-burgundy text-white rounded-2xl rounded-br-sm shadow-sm'
            : 'bg-soft-gray border border-border-gray text-deep-charcoal rounded-2xl rounded-bl-sm shadow-sm'
          }
        `}
      >
        {message.content}
      </div>
    </motion.div>
  );
}
