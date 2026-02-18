/**
 * ChatMessage - Individual Chat Bubble
 *
 * AI messages appear on the left with light gray background.
 * User messages appear on the right with burgundy background.
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      role="article"
      aria-label={isUser ? 'Your message' : 'AI assistant message'}
    >
      <div
        className={`
          max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed
          ${isUser
            ? 'bg-[#9F1239] text-white rounded-br-md'
            : 'bg-[#F5F5F4] border border-[#E7E5E4] text-[#1C1917] rounded-bl-md'
          }
        `}
      >
        {message.content}
      </div>
    </motion.div>
  );
}
