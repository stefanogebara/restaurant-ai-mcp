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

  if (lower.includes('mesa') || lower.includes('table') || lower.includes('disponiv') || lower.includes('available')) {
    return `Voce tem ${avail} de ${ctx.totalTables} mesas disponiveis (${occupancy}% de ocupacao). ${
      avail <= 2
        ? 'Ficando apertado -- considere a lista de espera para novos walk-ins.'
        : 'Bastante espaco para walk-ins.'
    }`;
  }

  if (lower.includes('espera') || lower.includes('waitlist') || lower.includes('fila')) {
    return ctx.waitlistCount > 0
      ? `${ctx.waitlistCount === 1 ? 'Ha 1 grupo' : `Ha ${ctx.waitlistCount} grupos`} na lista de espera. Voce tem ${avail} mesas livres, entao pode sentar alguem agora.`
      : 'A lista de espera esta vazia -- ninguem esperando no momento.';
  }

  if (lower.includes('reserva') || lower.includes('reservation') || lower.includes('booking')) {
    return `Voce tem ${ctx.reservationsToday} reservas para hoje. ${
      ctx.reservationsToday > 4
        ? 'Dia cheio pela frente -- garanta que a equipe esta preparada.'
        : 'Uma carga tranquila para hoje.'
    }`;
  }

  if (lower.includes('cliente') || lower.includes('guest') || lower.includes('pessoa') || lower.includes('cover')) {
    return `${ctx.totalGuests} clientes estao sentados em ${ctx.activeParties} ${ctx.activeParties === 1 ? 'grupo ativo' : 'grupos ativos'}.`;
  }

  if (lower.includes('status') || lower.includes('resumo') || lower.includes('overview') || lower.includes('como')) {
    return `Aqui esta seu resumo: ${ctx.occupiedTables}/${ctx.totalTables} mesas ocupadas (${occupancy}%), ${ctx.activeParties} grupos ativos com ${ctx.totalGuests} clientes sentados, ${ctx.reservationsToday} reservas hoje e ${ctx.waitlistCount} na lista de espera.`;
  }

  if (lower.includes('equipe') || lower.includes('staff') || lower.includes('func')) {
    return `Com ${ctx.activeParties} grupos ativos e ${ctx.reservationsToday} reservas, eu recomendaria pelo menos ${Math.max(2, Math.ceil(ctx.activeParties / 2))} garcons e 1 hostess no salao agora.`;
  }

  if (lower.includes('ajuda') || lower.includes('help') || lower.includes('o que')) {
    return 'Posso ajudar com: disponibilidade de mesas, lista de espera, resumo de reservas, contagem de clientes, sugestoes de equipe e um resumo geral. E so perguntar!';
  }

  if (lower.includes('oi') || lower.includes('ola') || lower.includes('hello') || lower.includes('hi')) {
    return `Oi! Voce tem ${ctx.activeParties} grupos sentados e ${ctx.reservationsToday} reservas hoje. Como posso ajudar?`;
  }

  return `Agora voce tem ${avail} mesas livres, ${ctx.activeParties} grupos ativos e ${ctx.reservationsToday} reservas hoje. Pergunte sobre mesas, espera, reservas, clientes ou equipe para mais detalhes.`;
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
      content: `Oi! Sou seu assistente de gerencia com IA. Voce tem ${activeParties} grupos ativos e ${reservationsToday} reservas hoje. Pergunte qualquer coisa sobre o status do seu restaurante.`,
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
          <h3 className="text-sm font-semibold text-white">Gerente IA</h3>
          <p className="text-[11px] text-muted-stone">Modo demo -- sem dados reais</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-muted-stone hover:text-white transition-colors"
          aria-label="Fechar chat"
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
            placeholder="Pergunte sobre seu restaurante..."
            className="flex-1 px-3.5 py-2.5 bg-soft-gray border border-border-gray rounded-xl text-sm text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/30"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="w-9 h-9 bg-burgundy hover:bg-burgundy-dark disabled:bg-muted-stone text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
            aria-label="Enviar mensagem"
          >
            <ThiingsIcon name="send" pxSize={14} />
          </button>
        </form>
      </div>
    </div>
  );
}
