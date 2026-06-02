/**
 * Scrollable transcript. Auto-scrolls to the bottom on new messages so the
 * user always sees the latest bot turn without manual scrolling.
 *
 * The scraped-restaurant card is rendered as a child here when the parent
 * passes one, slotted ABOVE the rest of the bot's intro messages — that way
 * the user sees the data immediately on first paint.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { ChatMessage } from '../../lib/onboarding-chat/flow.types';
import ChatBubble from './ChatBubble';

export interface ChatThreadProps {
  messages: readonly ChatMessage[];
  /** Rendered between the first bot bubble and the rest. Use for the scraped-data card. */
  inlineSlot?: ReactNode;
  inlineSlotAfterMessageId?: string;
}

export default function ChatThread({ messages, inlineSlot, inlineSlotAfterMessageId }: ChatThreadProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-3" data-testid="chat-thread">
      {messages.map((m) => (
        <div key={m.id} className="contents">
          <ChatBubble message={m} />
          {inlineSlot && inlineSlotAfterMessageId === m.id && inlineSlot}
        </div>
      ))}
      <div ref={endRef} aria-hidden />
    </div>
  );
}
