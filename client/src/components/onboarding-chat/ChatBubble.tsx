/**
 * One chat bubble. Bot bubbles are left-aligned, user bubbles right-aligned.
 * Bubble copy is plain text — formatting like the scraped-data card lives
 * in {@link RestaurantCard} which renders OUTSIDE this component.
 */
import type { ChatMessage } from '../../lib/onboarding-chat/flow.types';

export default function ChatBubble({ message }: { message: ChatMessage }) {
  const isBot = message.turn === 'bot';
  return (
    <div className={`w-full flex ${isBot ? 'justify-start' : 'justify-end'}`}>
      <div
        className={
          'max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ' +
          (isBot
            ? 'bg-white border border-glass-border-dark text-deep-charcoal rounded-bl-sm'
            : 'bg-burgundy text-white rounded-br-sm')
        }
        data-testid={isBot ? 'chat-bot-bubble' : 'chat-user-bubble'}
      >
        {message.text}
      </div>
    </div>
  );
}
