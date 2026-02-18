/**
 * ChatInput - Text Input with Send Button
 *
 * Input field for the interview chat.
 *
 * Accessibility:
 * - Input has an explicit aria-label.
 * - The send button has aria-label and is disabled (not just aria-disabled)
 *   when there is no content or when loading, so keyboard and AT users get
 *   the native disabled behaviour.
 * - Focus returns to the input after each send.
 *
 * UX:
 * - Minimum touch target height of 44px meets WCAG 2.5.5.
 * - The container border highlights when the input is focused (group-focus-within).
 * - maxLength prevents unbounded input.
 * - autocomplete="off" avoids browser autofill interfering with chat.
 */

import { useState, useRef, useEffect, type KeyboardEvent } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

const MAX_LENGTH = 800;

export default function ChatInput({ onSend, isLoading, placeholder = 'Type your answer\u2026' }: ChatInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Return focus to input when AI finishes responding
  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = value.trim().length > 0 && !isLoading;
  const charCount = value.length;
  const nearLimit = charCount > MAX_LENGTH * 0.85;

  return (
    <div className="space-y-1">
      <div
        className={`
          group flex items-center gap-2 px-3 py-2
          bg-white border rounded-xl
          transition-colors duration-150
          ${isLoading ? 'border-[#E7E5E4] bg-[#FAFAF9]' : 'border-[#E7E5E4] focus-within:border-[#9F1239]/60 focus-within:ring-2 focus-within:ring-[#9F1239]/20'}
        `}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          maxLength={MAX_LENGTH}
          autoComplete="off"
          autoCorrect="on"
          spellCheck
          aria-label="Type your answer to the AI's question"
          aria-describedby={nearLimit ? 'chat-char-count' : undefined}
          className="flex-1 min-w-0 bg-transparent py-1.5 text-sm text-[#1C1917] placeholder-[#A8A29E] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          aria-label={isLoading ? 'Sending message' : 'Send message'}
          className="
            flex-shrink-0 w-11 h-11 rounded-lg
            bg-[#9F1239] text-white
            flex items-center justify-center
            transition-all duration-150
            hover:bg-[#881337]
            active:scale-95
            focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:ring-offset-2
            disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-[#9F1239] disabled:active:scale-100
          "
        >
          {isLoading ? (
            <svg
              className="w-4 h-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>

      {/* Character count — only appears near the limit */}
      {nearLimit && (
        <p
          id="chat-char-count"
          className={`text-xs text-right pr-1 tabular-nums ${charCount >= MAX_LENGTH ? 'text-red-500 font-semibold' : 'text-[#A8A29E]'}`}
          aria-live="polite"
        >
          {charCount}/{MAX_LENGTH}
        </p>
      )}
    </div>
  );
}
