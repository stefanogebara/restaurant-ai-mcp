/**
 * LearningChat - Phase 2 Chat Interface
 *
 * Message list with auto-scroll, quick replies, extraction progress,
 * and input field for the restaurant learning interview.
 */

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
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

export default function LearningChat({
  messages,
  topicsCovered,
  isLoading,
  onSendMessage,
  onGeneratePersona,
}: LearningChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Smooth-scroll to bottom on new messages and typing indicator
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isLoading]);

  // Get quick replies from last AI message
  const lastAiMessage = [...messages].reverse().find(m => m.role === 'assistant');
  const quickReplies = lastAiMessage?.quick_replies || [];

  const canGeneratePersona = topicsCovered.length >= 4;

  return (
    <div className="flex flex-col space-y-4">
      {/* Extraction Progress */}
      <ExtractionProgress topicsCovered={topicsCovered} />

      {/* Messages */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="AI interview conversation"
        aria-atomic="false"
        className="flex-1 overflow-y-auto scroll-smooth space-y-3 min-h-[280px] max-h-[400px] pr-3"
      >
        {messages.map(message => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
            aria-label="AI is typing"
            role="status"
          >
            <div className="bg-[#F5F5F4] border border-[#E7E5E4] rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5" aria-hidden="true">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full bg-[#A8A29E]"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Scroll sentinel */}
        <div ref={bottomRef} />
      </div>

      {/* Quick Replies */}
      {!isLoading && quickReplies.length > 0 && (
        <QuickReplyButtons
          replies={quickReplies}
          onSelect={onSendMessage}
          disabled={isLoading}
        />
      )}

      {/* Generate Persona Button */}
      {canGeneratePersona && !isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-1"
        >
          <p className="text-xs text-[#A8A29E]">
            You can keep chatting or generate now
          </p>
          <button
            type="button"
            onClick={onGeneratePersona}
            className="px-5 py-2 text-sm font-semibold text-[#9F1239] border border-[#9F1239] rounded-full hover:bg-[#9F1239]/10 focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:ring-offset-2 transition-colors"
          >
            Generate Persona Preview
          </button>
        </motion.div>
      )}

      {/* Chat Input */}
      <ChatInput onSend={onSendMessage} isLoading={isLoading} />
    </div>
  );
}
