/**
 * ChatInput - Text Input with Send Button
 *
 * Input field for the interview chat with a send button.
 */

import { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, isLoading, placeholder = 'Type your answer...' }: ChatInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-[#F5F5F4] border border-[#E7E5E4] rounded-xl">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isLoading}
        aria-label="Type your answer to the AI's question"
        aria-disabled={isLoading}
        className="flex-1 bg-transparent px-3 py-2 text-sm text-[#1C1917] placeholder-[#A8A29E] focus:outline-none disabled:opacity-50"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!value.trim() || isLoading}
        aria-label="Send message"
        className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#9F1239] hover:bg-[#881337] text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:ring-offset-2"
      >
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        )}
      </button>
    </div>
  );
}
