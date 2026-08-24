import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TestarNoMeuWhatsApp from './TestarNoMeuWhatsApp';

/**
 * A conversa de reserva VIVA do demo — visual de WhatsApp, IA de verdade.
 *
 * A versão anterior era um filme: cinco mensagens com roteiro fixo e um botão
 * "Repetir". A tese inteira do produto — "uma IA atende o WhatsApp do seu
 * restaurante" — era a única coisa FALSA do demo, enquanto o chat do gerente
 * ao lado respondia com IA real. Inversão de prioridade descoberta no
 * walkthrough de 28/jul/2026.
 *
 * Agora o dono digita como se fosse um cliente e a recepcionista IA responde
 * com os dados DELE (horários do Google, pratos citados nas avaliações), via
 * /api/demo-chat com persona 'recepcionista' e histórico multi-turno.
 *
 * Falha de rede aqui é HONESTA: um aviso de sistema, nunca uma resposta
 * enlatada fingindo ser IA — o enlatado silencioso já escondeu por semanas que
 * 100% das chamadas do chat do gerente morriam em 400.
 */

/** Reserva estruturada extraída pelo servidor do marcador [[BOOKED]] (F2). */
export interface DemoChatBooking {
  date: string;
  time: string;
  party_size: number;
  name: string;
}

interface DemoWhatsAppSimProps {
  restaurantName: string;
  lang: string;
  /** restaurant_config.id do demo por token — sem ele a IA real não responde. */
  restaurantId?: string;
  /** preset ('italian', 'makoto'...) quando não há restaurante no banco. */
  presetKey?: string;
  /** Dispara quando a IA fecha uma reserva — é o gatilho do payoff no painel. */
  onBooking?: (booking: DemoChatBooking) => void;
}

interface ChatMsg {
  role: 'customer' | 'ai' | 'system';
  text: string;
  at: string;
}

const labels = {
  en: {
    title: 'WhatsApp AI', subtitle: 'Booking Assistant', typing: 'typing...',
    placeholder: 'Type as if you were a guest...',
    live: 'Real AI — answering with your restaurant data',
    offline: 'AI unavailable right now — please try again in a moment.',
    greeting: (name: string) => `Hi! 👋 I'm the AI receptionist at ${name}. I can book your table — how many people and when?`,
    chips: ['Table for 4 on Friday 8pm', 'What are your opening hours?', 'Which dishes do you recommend?'],
  },
  'pt-BR': {
    title: 'WhatsApp IA', subtitle: 'Assistente de Reservas', typing: 'digitando...',
    placeholder: 'Digite como se fosse um cliente...',
    live: 'IA real — respondendo com os dados do seu restaurante',
    offline: 'IA indisponível agora — tente novamente em instantes.',
    greeting: (name: string) => `Oi! 👋 Sou a recepcionista IA do ${name}. Posso reservar sua mesa — para quantas pessoas e quando?`,
    chips: ['Mesa pra 4 sexta às 20h', 'Que horas vocês abrem?', 'Qual prato vocês recomendam?'],
  },
  es: {
    title: 'WhatsApp IA', subtitle: 'Asistente de Reservas', typing: 'escribiendo...',
    placeholder: 'Escribe como si fueras un cliente...',
    live: 'IA real — respondiendo con los datos de tu restaurante',
    offline: 'IA no disponible ahora — inténtalo de nuevo en un momento.',
    greeting: (name: string) => `¡Hola! 👋 Soy la recepcionista IA de ${name}. Puedo reservar tu mesa — ¿para cuántas personas y cuándo?`,
    chips: ['Mesa para 4 el viernes 21h', '¿A qué hora abren?', '¿Qué platos recomiendan?'],
  },
} as const;

const agora = () =>
  new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function DemoWhatsAppSim({ restaurantName, lang, restaurantId, presetKey, onBooking }: DemoWhatsAppSimProps) {
  const t = labels[lang as keyof typeof labels] ?? labels.en;
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'ai', text: t.greeting(restaurantName), at: agora() },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || isTyping) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'customer', text, at: agora() }]);
    setIsTyping(true);

    // Histórico no formato do modelo. 'system' (avisos de indisponibilidade)
    // fica de fora — não é fala de ninguém.
    const history = messages
      .filter((m) => m.role !== 'system')
      .slice(-10)
      .map((m) => ({ role: m.role === 'customer' ? 'user' : 'assistant', content: m.text }));

    try {
      const res = await fetch('/api/demo-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          persona: 'recepcionista',
          restaurant_id: restaurantId,
          preset_key: presetKey,
          lang,
          context: { restaurantName },
        }),
      });
      const data = await res.json().catch(() => null);
      if (data?.reply) {
        setMessages((prev) => [...prev, { role: 'ai', text: data.reply, at: agora() }]);
        if (data.booking) onBooking?.(data.booking as DemoChatBooking);
      } else {
        console.warn('[demo-whatsapp] sem resposta da IA:', data?.error || res.status);
        setMessages((prev) => [...prev, { role: 'system', text: t.offline, at: agora() }]);
      }
    } catch (err) {
      console.warn('[demo-whatsapp] chamada falhou:', (err as Error)?.message);
      setMessages((prev) => [...prev, { role: 'system', text: t.offline, at: agora() }]);
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  };

  // Chips somem depois da primeira mensagem do "cliente".
  const mostrarChips = !messages.some((m) => m.role === 'customer');

  return (
    <div className="max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 bg-[#075E54] text-white rounded-t-xl px-4 py-3">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
          IA
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">{t.title}</div>
          <div className="text-[10px] text-white/70">{isTyping ? t.typing : t.subtitle}</div>
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald-400" />
      </div>

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="bg-[#ECE5DD] min-h-[360px] max-h-[420px] overflow-y-auto px-3 py-4 space-y-2"
      >
        <AnimatePresence mode="popLayout">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25 }}
              className={`flex ${msg.role === 'customer' ? 'justify-end' : 'justify-center'} ${msg.role === 'ai' ? '!justify-start' : ''}`}
            >
              {msg.role === 'system' ? (
                <div className="bg-[#FFF3CD] text-[#664D03] text-[12px] px-3 py-1.5 rounded-full shadow-sm">
                  ⚠️ {msg.text}
                </div>
              ) : (
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-lg text-[13px] leading-relaxed whitespace-pre-line ${
                    msg.role === 'customer'
                      ? 'bg-[#DCF8C6] text-[#111] rounded-tr-none'
                      : 'bg-white text-[#111] rounded-tl-none'
                  }`}
                >
                  {msg.text}
                  <div className={`text-[10px] mt-1 text-right ${msg.role === 'customer' ? 'text-[#6B7C6B]' : 'text-muted-stone'}`}>
                    {msg.at}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {isTyping && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="bg-white rounded-lg rounded-tl-none px-4 py-2.5 shadow-sm">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    className="w-1.5 h-1.5 rounded-full bg-[#075E54]/50"
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Sugestões de primeira mensagem */}
        {mostrarChips && !isTyping && (
          <div className="flex flex-wrap gap-2 justify-end pt-2">
            {t.chips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => send(chip)}
                className="bg-white/90 hover:bg-white text-[#075E54] text-[12px] font-medium px-3 py-1.5 rounded-full border border-[#075E54]/20 shadow-sm transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="bg-[#F0F0F0] rounded-b-xl px-3 py-2.5 border-t border-[#D1D5DB]">
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.placeholder}
            maxLength={500}
            className="flex-1 bg-white rounded-full px-4 py-2 text-[13px] outline-none border border-transparent focus:border-[#075E54]/30"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            aria-label="Enviar"
            className="w-9 h-9 rounded-full bg-[#075E54] text-white flex items-center justify-center disabled:opacity-40 transition-opacity"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </form>
        <div className="text-[10px] text-muted-stone text-center mt-1.5">{t.live}</div>
      </div>

      {/* Logo abaixo da conversa: o chat prova a IA na TELA; isto põe o produto
          no telefone do dono, que é o argumento que fecha. */}
      <div className="mt-4">
        <TestarNoMeuWhatsApp
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          lang={lang}
        />
      </div>
    </div>
  );
}
