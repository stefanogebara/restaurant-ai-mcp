import { useState, useRef, useEffect } from 'react';
import ThiingsIcon from '../common/ThiingsIcon';
import type { DemoLang } from '../../hooks/useDemoLocale';

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
  lang: DemoLang;
}

type Ctx = Omit<DemoManagerChatProps, 'onClose' | 'lang'>;

function buildResponseEN(input: string, ctx: Ctx): string {
  const lower = input.toLowerCase();
  const avail = ctx.totalTables - ctx.occupiedTables;
  const occ = ctx.totalTables > 0 ? Math.round((ctx.occupiedTables / ctx.totalTables) * 100) : 0;

  if (lower.includes('table') || lower.includes('available'))
    return `You currently have ${avail} of ${ctx.totalTables} tables available (${occ}% occupancy). ${avail <= 2 ? 'Getting tight -- consider the waitlist for new walk-ins.' : 'Plenty of room for walk-ins.'}`;
  if (lower.includes('waitlist') || lower.includes('waiting'))
    return ctx.waitlistCount > 0 ? `There ${ctx.waitlistCount === 1 ? 'is 1 party' : `are ${ctx.waitlistCount} parties`} on the waitlist. You have ${avail} tables free.` : 'The waitlist is clear -- no one waiting.';
  if (lower.includes('reservation') || lower.includes('booking'))
    return `You have ${ctx.reservationsToday} reservations for today. ${ctx.reservationsToday > 4 ? 'Busy day ahead.' : 'A manageable load.'}`;
  if (lower.includes('guest') || lower.includes('cover') || lower.includes('people'))
    return `${ctx.totalGuests} guests seated across ${ctx.activeParties} active ${ctx.activeParties === 1 ? 'party' : 'parties'}.`;
  if (lower.includes('status') || lower.includes('overview') || lower.includes('summary') || lower.includes('how'))
    return `Snapshot: ${ctx.occupiedTables}/${ctx.totalTables} tables occupied (${occ}%), ${ctx.activeParties} active parties with ${ctx.totalGuests} guests, ${ctx.reservationsToday} reservations today, ${ctx.waitlistCount} on the waitlist.`;
  if (lower.includes('staff') || lower.includes('team'))
    return `With ${ctx.activeParties} active parties, I'd recommend at least ${Math.max(2, Math.ceil(ctx.activeParties / 2))} servers and 1 host on the floor.`;
  if (lower.includes('help') || lower.includes('what can'))
    return 'I can help with: table availability, waitlist status, reservations, guest counts, staffing suggestions, and a general summary.';
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey'))
    return `Hi! You've got ${ctx.activeParties} parties seated and ${ctx.reservationsToday} reservations today. How can I help?`;
  return `Right now: ${avail} tables free, ${ctx.activeParties} active parties, ${ctx.reservationsToday} reservations. Ask about tables, waitlist, reservations, guests, or staffing.`;
}

function buildResponsePT(input: string, ctx: Ctx): string {
  const lower = input.toLowerCase();
  const avail = ctx.totalTables - ctx.occupiedTables;
  const occ = ctx.totalTables > 0 ? Math.round((ctx.occupiedTables / ctx.totalTables) * 100) : 0;

  if (lower.includes('mesa') || lower.includes('disponiv') || lower.includes('table'))
    return `Voce tem ${avail} de ${ctx.totalTables} mesas disponiveis (${occ}% de ocupacao). ${avail <= 2 ? 'Ficando apertado -- considere a lista de espera.' : 'Bastante espaco para walk-ins.'}`;
  if (lower.includes('espera') || lower.includes('fila') || lower.includes('waitlist'))
    return ctx.waitlistCount > 0 ? `${ctx.waitlistCount === 1 ? 'Ha 1 grupo' : `Ha ${ctx.waitlistCount} grupos`} na lista de espera. Voce tem ${avail} mesas livres.` : 'Lista de espera vazia -- ninguem esperando.';
  if (lower.includes('reserva') || lower.includes('booking'))
    return `Voce tem ${ctx.reservationsToday} reservas para hoje. ${ctx.reservationsToday > 4 ? 'Dia cheio pela frente.' : 'Carga tranquila para hoje.'}`;
  if (lower.includes('cliente') || lower.includes('pessoa') || lower.includes('guest'))
    return `${ctx.totalGuests} clientes sentados em ${ctx.activeParties} ${ctx.activeParties === 1 ? 'grupo ativo' : 'grupos ativos'}.`;
  if (lower.includes('status') || lower.includes('resumo') || lower.includes('como'))
    return `Resumo: ${ctx.occupiedTables}/${ctx.totalTables} mesas ocupadas (${occ}%), ${ctx.activeParties} grupos ativos com ${ctx.totalGuests} clientes, ${ctx.reservationsToday} reservas hoje, ${ctx.waitlistCount} na espera.`;
  if (lower.includes('equipe') || lower.includes('func') || lower.includes('staff'))
    return `Com ${ctx.activeParties} grupos ativos, recomendo pelo menos ${Math.max(2, Math.ceil(ctx.activeParties / 2))} garcons e 1 hostess no salao.`;
  if (lower.includes('ajuda') || lower.includes('o que'))
    return 'Posso ajudar com: mesas, lista de espera, reservas, clientes, equipe e resumo geral.';
  if (lower.includes('oi') || lower.includes('ola') || lower.includes('bom'))
    return `Oi! Voce tem ${ctx.activeParties} grupos sentados e ${ctx.reservationsToday} reservas hoje. Como posso ajudar?`;
  return `Agora: ${avail} mesas livres, ${ctx.activeParties} grupos ativos, ${ctx.reservationsToday} reservas. Pergunte sobre mesas, espera, reservas, clientes ou equipe.`;
}

const uiLabels = {
  en: { title: 'Manager AI', subtitle: 'Demo mode -- no real data', close: 'Close chat', placeholder: 'Ask about your restaurant...', send: 'Send message' },
  'pt-BR': { title: 'Gerente IA', subtitle: 'Modo demo -- sem dados reais', close: 'Fechar chat', placeholder: 'Pergunte sobre seu restaurante...', send: 'Enviar mensagem' },
} as const;

let msgCounter = 0;

async function fetchAIResponse(message: string, ctx: Ctx, lang: DemoLang): Promise<string | null> {
  try {
    const res = await fetch('/api/demo-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        context: {
          occupiedTables: ctx.occupiedTables,
          totalTables: ctx.totalTables,
          activeParties: ctx.activeParties,
          waitlistCount: ctx.waitlistCount,
          reservationsToday: ctx.reservationsToday,
          totalGuests: ctx.totalGuests,
        },
        lang,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.reply || null;
  } catch {
    return null;
  }
}

export default function DemoManagerChat({
  occupiedTables, totalTables, activeParties, waitlistCount, reservationsToday, totalGuests, onClose, lang,
}: DemoManagerChatProps) {
  const ui = uiLabels[lang];
  const introMsg = lang === 'pt-BR'
    ? `Oi! Sou seu gerente IA. Voce tem ${activeParties} grupos ativos e ${reservationsToday} reservas hoje. Pergunte qualquer coisa!`
    : `Hi! I'm your AI manager assistant. You have ${activeParties} active parties and ${reservationsToday} reservations today. Ask me anything!`;

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'intro', role: 'assistant', content: introMsg },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;

    msgCounter += 1;
    const userMsg: ChatMessage = { id: `u${msgCounter}`, role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const ctx: Ctx = { occupiedTables, totalTables, activeParties, waitlistCount, reservationsToday, totalGuests };

    // Try real AI, fall back to keyword-matched response
    const aiReply = await fetchAIResponse(text, ctx, lang);
    const reply = aiReply || (lang === 'pt-BR' ? buildResponsePT(text, ctx) : buildResponseEN(text, ctx));

    msgCounter += 1;
    setMessages((prev) => [...prev, { id: `a${msgCounter}`, role: 'assistant', content: reply }]);
    setIsTyping(false);
  };

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-20 sm:right-24 z-50 w-[360px] max-h-[480px] bg-white rounded-2xl shadow-2xl border border-border-gray flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-soft-gray bg-deep-charcoal rounded-t-2xl">
        <div>
          <h3 className="text-sm font-semibold text-white">{ui.title}</h3>
          <p className="text-[11px] text-muted-stone">{ui.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-muted-stone hover:text-white transition-colors"
          aria-label={ui.close}
        >
          <ThiingsIcon name="close" pxSize={14} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[320px]">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user' ? 'bg-burgundy text-white rounded-br-md' : 'bg-soft-gray text-deep-charcoal rounded-bl-md'
            }`}>
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
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={ui.placeholder}
            className="flex-1 px-3.5 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-sm text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/30"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="w-9 h-9 bg-burgundy hover:bg-burgundy-dark disabled:bg-muted-stone text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
            aria-label={ui.send}
          >
            <ThiingsIcon name="send" pxSize={14} />
          </button>
        </form>
      </div>
    </div>
  );
}
