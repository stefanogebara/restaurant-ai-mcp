import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DemoAIInsightsBarProps {
  restaurantName: string;
  occupiedTables: number;
  totalTables: number;
  reservationsToday: number;
  waitlistCount: number;
  totalGuests: number;
  completedCount?: number;
  totalRevenue?: number;
  lang: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

// ── i18n ──

const labels = {
  en: {
    title: 'Manager AI',
    inputPlaceholder: 'Ask about your restaurant...',
    typing: 'Thinking...',
    insightCapLabel: 'Capacity',
    insightStaffLabel: 'Staffing',
    insightWaitLabel: 'Waitlist',
    insightVipLabel: 'VIP Alert',
    powered: 'Powered by Seatable AI',
  },
  'pt-BR': {
    title: 'IA do Gerente',
    inputPlaceholder: 'Pergunte sobre seu restaurante...',
    typing: 'Pensando...',
    insightCapLabel: 'Capacidade',
    insightStaffLabel: 'Equipe',
    insightWaitLabel: 'Fila de Espera',
    insightVipLabel: 'Alerta VIP',
    powered: 'Powered by Seatable AI',
  },
} as const;

// Keyword-matched fallback responses when API is unavailable
const cannedResponses: Record<string, Array<{ keywords: string[]; response: string }>> = {
  en: [
    { keywords: ['today', 'tonight', 'movement', 'busy', 'how'], response: `Right now we have ${'{occupied}'} tables occupied out of ${'{total}'}. ${'{waitlist}'} groups on the waitlist. I'd recommend preparing for the dinner rush.` },
    { keywords: ['staff', 'team', 'server', 'waiter'], response: "Your average table turn time this week is 52 minutes — 8% faster than last week. Great efficiency from the team." },
    { keywords: ['revenue', 'money', 'sales', 'billing'], response: "Based on current reservations and average spend, I'd estimate tonight's revenue around $3,200. Consider upselling desserts to boost the average ticket." },
    { keywords: ['reservation', 'booking', 'table'], response: "Looking at your reservation patterns, Fridays between 19:00-20:30 consistently fill up. Consider adding a second seating window." },
  ],
  'pt-BR': [
    { keywords: ['hoje', 'movimento', 'como', 'noite', 'ocupação'], response: `Agora temos ${'{occupied}'} mesas ocupadas de ${'{total}'}. ${'{waitlist}'} grupos na lista de espera. Recomendo preparar a equipe para o pico do jantar.` },
    { keywords: ['equipe', 'garçom', 'staff', 'time'], response: "O tempo médio de rotação de mesa esta semana é de 52 minutos — 8% mais rápido que semana passada. Ótima eficiência da equipe." },
    { keywords: ['receita', 'faturamento', 'dinheiro', 'venda'], response: "Com base nas reservas atuais e gasto médio, estimo o faturamento de hoje em torno de R$ 8.500. Considere sugerir sobremesas para aumentar o ticket médio." },
    { keywords: ['reserva', 'mesa', 'disponível'], response: "Analisando seus padrões de reserva, sextas entre 19:00-20:30 lotam consistentemente. Considere adicionar um segundo turno." },
    { keywords: ['no-show', 'cancelamento', 'falta'], response: "Hoje temos 1 reserva com risco de no-show. Os lembretes automáticos por WhatsApp já foram enviados — historicamente reduzimos no-shows em 40%." },
  ],
};

function pickCannedResponse(text: string, langKey: string): string {
  const lower = text.toLowerCase();
  const responses = cannedResponses[langKey] || cannedResponses['en'];
  const match = responses.find(r => r.keywords.some(kw => lower.includes(kw)));
  return match?.response || responses[0].response;
}

// Placeholder for stats injection — component will override this
let _statsForFallback = { occupied: '2', total: '8', waitlist: '2' };

// ── Sparkle Icon ──

const SparkleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="currentColor" opacity="0.9" />
    <path d="M19 2L19.8 4.2L22 5L19.8 5.8L19 8L18.2 5.8L16 5L18.2 4.2L19 2Z" fill="currentColor" opacity="0.5" />
  </svg>
);

// ── Component ──

function injectStats(text: string): string {
  return text
    .replace(/\{occupied\}/g, _statsForFallback.occupied)
    .replace(/\{total\}/g, _statsForFallback.total)
    .replace(/\{waitlist\}/g, _statsForFallback.waitlist);
}

export default function DemoAIInsightsBar({
  restaurantName,
  occupiedTables,
  totalTables,
  reservationsToday,
  waitlistCount,
  totalGuests,
  completedCount = 0,
  totalRevenue = 0,
  lang,
}: DemoAIInsightsBarProps) {
  // Update stats for fallback responses
  _statsForFallback = { occupied: String(occupiedTables), total: String(totalTables), waitlist: String(waitlistCount) };
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const langKey = lang === 'pt-BR' ? 'pt-BR' : 'en';
  const ui = labels[langKey];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Call real demo-chat API, fall back to canned responses on failure
    const apiBase = import.meta.env?.VITE_API_BASE_URL || '/api';
    fetch(`${apiBase}/demo-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        context: { occupiedTables, totalTables, reservationsToday, waitlistCount, totalGuests, restaurantName, completedCount, totalRevenue },
        lang: langKey,
      }),
    })
      .then(res => res.json())
      .then(data => {
        const reply = data.reply || injectStats(pickCannedResponse(text, langKey));
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: reply }]);
      })
      .catch(() => {
        const reply = injectStats(pickCannedResponse(text, langKey));
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: reply }]);
      })
      .finally(() => setIsTyping(false));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-lg overflow-hidden"
      data-testid="ai-insights-bar"
    >
      <div className="flex flex-col gap-4">
        {/* ── Full-width Manager AI Chat ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="flex-1 min-w-0 flex flex-col rounded-lg overflow-hidden
            bg-white
            border border-[#E5E7EB]
          "
        >
          {/* Chat header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#E5E7EB]">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-burgundy to-burgundy-dark flex items-center justify-center shadow-sm">
              <span className="text-white"><SparkleIcon /></span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-deep-charcoal leading-none">{ui.title}</h3>
              <p className="text-[10px] text-muted-stone mt-0.5">{ui.powered}</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]" />
          </div>

          {/* Messages area */}
          <div className="flex-1 px-4 py-4 space-y-3 min-h-[120px] max-h-[320px] overflow-y-auto scrollbar-thin">
            {messages.length === 0 && (
              <div className="text-center py-4">
                <p className="text-xs text-muted-stone/70 italic">
                  {langKey === 'pt-BR'
                    ? '"Como está o movimento hoje?" ou "Sugira algo para o jantar"'
                    : '"How is tonight looking?" or "Suggest something for dinner service"'}
                </p>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.2 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-md bg-gradient-to-br from-burgundy to-burgundy-dark flex items-center justify-center mr-2 mt-0.5 flex-shrink-0 shadow-sm">
                      <SparkleIcon />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-burgundy text-white rounded-br-md'
                        : 'bg-white/80 text-deep-charcoal border border-border-gray/50 rounded-bl-md shadow-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Typing indicator */}
            {isTyping && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2"
              >
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-burgundy to-burgundy-dark flex items-center justify-center flex-shrink-0 shadow-sm">
                  <SparkleIcon />
                </div>
                <div className="bg-white/80 border border-border-gray/50 rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-stone">{ui.typing}</span>
                    <div className="flex gap-0.5">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                          className="w-1 h-1 rounded-full bg-burgundy/60"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="px-3 pb-3 pt-1">
            <div className="flex items-center gap-2 bg-white/60 backdrop-blur-sm border border-border-gray/60 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-burgundy/20 focus-within:border-burgundy/30 transition-all">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={ui.inputPlaceholder}
                className="flex-1 bg-transparent text-[13px] text-deep-charcoal placeholder-muted-stone focus:outline-none py-1"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="w-7 h-7 rounded-lg bg-burgundy hover:bg-burgundy-dark disabled:bg-muted-stone/30 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors flex-shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </motion.div>
  );
}
