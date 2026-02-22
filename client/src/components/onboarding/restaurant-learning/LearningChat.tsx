/**
 * LearningChat - Phase 2 Chat Interface
 *
 * Message list with auto-scroll, quick replies, extraction progress,
 * and input field for the restaurant learning interview.
 *
 * Accessibility:
 * - The message log carries role="log" with aria-live="polite" so new messages
 *   are announced by screen readers without interrupting ongoing speech.
 * - The typing indicator is separate with role="status" and its own aria-live.
 * - The generate-persona button explains the threshold requirement in its aria-label.
 */

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { InterviewMessage } from '../../../types/restaurant-learning.types';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import QuickReplyButtons from './QuickReplyButtons';
import ExtractionProgress from './ExtractionProgress';

interface LearningChatProps {
  messages: InterviewMessage[];
  topicsCovered: string[];
  isLoading: boolean;
  onSendMessage: (content: string) => void;
  onGeneratePersona: () => void;
}

const PERSONA_THRESHOLD = 4;

export default function LearningChat({
  messages,
  topicsCovered,
  isLoading,
  onSendMessage,
  onGeneratePersona,
}: LearningChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Smooth-scroll to bottom on new messages and typing indicator
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isLoading]);

  // Get quick replies from last AI message
  const lastAiMessage = [...messages].reverse().find(m => m.role === 'assistant');
  const quickReplies = lastAiMessage?.quick_replies ?? [];

  const canGeneratePersona = topicsCovered.length >= PERSONA_THRESHOLD;

  return (
    <div className="flex flex-col gap-4">
      {/* Extraction Progress */}
      <ExtractionProgress topicsCovered={topicsCovered} />

      {/* Message Log */}
      <div
        role="log"
        aria-live="polite"
        aria-label="AI interview conversation"
        aria-atomic="false"
        aria-relevant="additions"
        className="overflow-y-auto scroll-smooth min-h-[260px] max-h-[380px] sm:max-h-[440px] space-y-3 px-1 py-1"
        style={{ overscrollBehavior: 'contain' }}
      >
        {messages.map(message => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {/* Typing indicator — separate live region so it doesn't conflict with the log */}
        <AnimatePresence>
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              className="flex justify-start"
            >
              <div
                role="status"
                aria-live="polite"
                aria-label="AI assistant is typing"
                className="bg-soft-gray border border-border-gray rounded-2xl rounded-bl-md px-4 py-3 shadow-sm"
              >
                <div className="flex gap-1.5" aria-hidden="true">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 rounded-full bg-muted-stone"
                      animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scroll sentinel */}
        <div ref={bottomRef} aria-hidden="true" />
      </div>

      {/* Quick Replies */}
      <AnimatePresence>
        {!isLoading && quickReplies.length > 0 && (
          <QuickReplyButtons
            replies={quickReplies}
            onSelect={onSendMessage}
            disabled={isLoading}
          />
        )}
      </AnimatePresence>

      {/* Generate Persona CTA — appears once threshold is met */}
      <AnimatePresence>
        {canGeneratePersona && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-2 py-1"
          >
            <p className="text-xs text-muted-stone text-center">
              You can keep chatting to add more detail, or generate your persona now
            </p>
            <button
              type="button"
              onClick={onGeneratePersona}
              aria-label={`Generate AI persona preview — ${topicsCovered.length} topics covered`}
              className="
                px-5 py-2.5 text-sm font-semibold
                text-burgundy border-2 border-burgundy rounded-full
                hover:bg-burgundy/10
                focus:outline-none focus:ring-2 focus:ring-burgundy focus:ring-offset-2
                transition-colors duration-200
                active:scale-95
              "
            >
              Generate Persona Preview
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Input */}
      <ChatInput onSend={onSendMessage} isLoading={isLoading} />
    </div>
  );
}
