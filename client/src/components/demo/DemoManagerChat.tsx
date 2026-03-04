import { useState, useRef, useEffect } from 'react';
import ThiingsIcon from '../common/ThiingsIcon';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface DemoManagerChatProps {
  occupiedTables: number;
  totalTables: number;
  activeParties: number;
  waitlistCount: number;
  reservationsToday: number;
  totalGuests: number;
  onClose: () => void;
}

function buildResponse(input: string, ctx: Omit<DemoManagerChatProps, 'onClose'>): string {
  const lower = input.toLowerCase();
  const avail = ctx.totalTables - ctx.occupiedTables;
  const occupancy = ctx.totalTables > 0
    ? Math.round((ctx.occupiedTables / ctx.totalTables) * 100)
    : 0;

  if (lower.includes('table') || lower.includes('availability') || lower.includes('available')) {
    return `You currently have ${avail} of ${ctx.totalTables} tables available (${occupancy}% occupancy). ${
      avail <= 2
        ? 'Getting tight -- consider the waitlist for new walk-ins.'
        : 'Plenty of room for walk-ins.'
    }`;
  }

  if (lower.includes('waitlist') || lower.includes('wait list') || lower.includes('waiting')) {
    return ctx.waitlistCount > 0
      ? `There ${ctx.waitlistCount === 1 ? 'is 1 party' : `are ${ctx.waitlistCount} parties`} on the waitlist. You have ${avail} tables free, so you could seat someone now.`
      : 'The waitlist is clear -- no one waiting right now.';
  }

  if (lower.includes('reservation') || lower.includes('booking')) {
    return `You have ${ctx.reservationsToday} reservations for today. ${
      ctx.reservationsToday > 4
        ? 'Busy day ahead -- make sure staff is ready.'
        : 'A manageable load for today.'
    }`;
  }

  if (lower.includes('guest') || lower.includes('cover') || lower.includes('people')) {
    return `${ctx.totalGuests} guests are currently seated across ${ctx.activeParties} active ${ctx.activeParties === 1 ? 'party' : 'parties'}.`;
  }

  if (lower.includes('status') || lower.includes('overview') || lower.includes('summary') || lower.includes('how')) {
    return `Here's your snapshot: ${ctx.occupiedTables}/${ctx.totalTables} tables occupied (${occupancy}%), ${ctx.activeParties} active parties with ${ctx.totalGuests} guests seated, ${ctx.reservationsToday} reservations today, and ${ctx.waitlistCount} on the waitlist.`;
  }

  if (lower.includes('staff') || lower.includes('team')) {
    return `With ${ctx.activeParties} active parties and ${ctx.reservationsToday} upcoming reservations, I'd recommend at least ${Math.max(2, Math.ceil(ctx.activeParties / 2))} servers and 1 host on the floor right now.`;
  }

  if (lower.includes('help') || lower.includes('what can')) {
    return 'I can help with: table availability, waitlist status, reservation overview, guest counts, staffing suggestions, and a general status summary. Just ask!';
  }

  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
    return `Hi there! You've got ${ctx.activeParties} parties seated and ${ctx.reservationsToday} reservations today. How can I help?`;
  }

  return `Right now you have ${avail} tables free, ${ctx.activeParties} active parties, and ${ctx.reservationsToday} reservations today. Ask me about tables, waitlist, reservations, guests, or staffing for more detail.`;
}

let msgCounter = 0;

export default function DemoManagerChat({
  occupiedTables,
  totalTables,
  activeParties,
  waitlistCount,
  reservationsToday,
  totalGuests,
  onClose,
}: DemoManagerChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'intro',
      role: 'assistant',
      content: `Hi! I'm your AI manager assistant. You have ${activeParties} active parties and ${reservationsToday} reservations today. Ask me anything about your restaurant's status.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    msgCounter += 1;
    const userMsg: ChatMessage = { id: `u${msgCounter}`, role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Simulate typing delay
    setTimeout(() => {
      msgCounter += 1;
      const reply = buildResponse(text, {
        occupiedTables,
        totalTables,
        activeParties,
        waitlistCount,
        reservationsToday,
        totalGuests,
      });
      setMessages((prev) => [...prev, { id: `a${msgCounter}`, role: 'assistant', content: reply }]);
      setIsTyping(false);
    }, 600 + Math.random() * 400);
  };

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-20 sm:right-24 z-50 w-[360px] max-h-[480px] bg-white rounded-2xl shadow-2xl border border-border-gray flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-soft-gray bg-deep-charcoal rounded-t-2xl">
        <div>
          <h3 className="text-sm font-semibold text-white">Manager AI</h3>
          <p className="text-[11px] text-muted-stone">Demo mode -- no real data</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-muted-stone hover:text-white transition-colors"
          aria-label="Close chat"
        >
          <ThiingsIcon name="close" pxSize={14} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[320px]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-burgundy text-white rounded-br-md'
                  : 'bg-soft-gray text-deep-charcoal rounded-bl-md'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-soft-gray text-muted-stone px-4 py-2.5 rounded-2xl rounded-bl-md text-sm">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-muted-stone rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-muted-stone rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-muted-stone rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-soft-gray px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your restaurant..."
            className="flex-1 px-3.5 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-sm text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/30"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="w-9 h-9 bg-burgundy hover:bg-burgundy-dark disabled:bg-muted-stone text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
            aria-label="Send message"
          >
            <ThiingsIcon name="send" pxSize={14} />
          </button>
        </form>
      </div>
    </div>
  );
}
