import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DemoWhatsAppSimProps {
  restaurantName: string;
  lang: string;
}

interface SimMessage {
  role: 'customer' | 'ai';
  text: string;
}

const labels = {
  en: { title: 'WhatsApp AI', subtitle: 'Booking Assistant', replay: 'Replay', typing: 'typing...' },
  'pt-BR': { title: 'WhatsApp IA', subtitle: 'Assistente de Reservas', replay: 'Repetir', typing: 'digitando...' },
  es: { title: 'WhatsApp IA', subtitle: 'Asistente de Reservas', replay: 'Repetir', typing: 'escribiendo...' },
} as const;

/**
 * Next-Friday date label in locale-appropriate format. The previous version
 * hardcoded "28/03" / "03/28" — the flagship WhatsApp demo always quoted the
 * same historical date regardless of when the prospect saw it, making the
 * demo feel stale by mid-March.
 */
function nextFridayLabel(lang: string): string {
  const now = new Date();
  // 0=Sun..6=Sat. Days until next Friday; if today IS Friday, jump a week so
  // the demo always shows an upcoming Friday.
  const daysUntilFri = ((5 - now.getDay() + 7) % 7) || 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntilFri);
  const day = String(next.getDate()).padStart(2, '0');
  const month = String(next.getMonth() + 1).padStart(2, '0');
  return lang === 'en' ? `${month}/${day}` : `${day}/${month}`;
}

function buildScript(name: string, lang: string): SimMessage[] {
  const friday = nextFridayLabel(lang);
  if (lang === 'pt-BR') {
    return [
      { role: 'customer', text: 'Oi, quero fazer uma reserva para 4 pessoas sexta às 20h' },
      { role: 'ai', text: `Olá! Claro, vou verificar a disponibilidade no ${name} para sexta, 4 pessoas às 20h...` },
      { role: 'ai', text: `Temos mesa disponível! Posso confirmar:\n\n📍 ${name}\n📅 Sexta, ${friday}\n🕗 20:00\n👥 4 pessoas\n\nQual seu nome completo?` },
      { role: 'customer', text: 'João Silva' },
      { role: 'ai', text: 'Perfeito, João! ✅ Reserva confirmada.\n\nEnviaremos um lembrete 2h antes. Até sexta!' },
    ];
  }
  if (lang === 'es') {
    return [
      { role: 'customer', text: 'Hola, quisiera reservar mesa para 4 personas el viernes a las 21h' },
      { role: 'ai', text: `¡Hola! Claro, déjame verificar disponibilidad en ${name} para el viernes, 4 personas a las 21:00...` },
      { role: 'ai', text: `¡Tenemos mesa disponible! ¿Puedo confirmar?\n\n📍 ${name}\n📅 Viernes, ${friday}\n🕗 21:00\n👥 4 personas\n\n¿Cuál es tu nombre completo?` },
      { role: 'customer', text: 'Carlos García' },
      { role: 'ai', text: '¡Perfecto, Carlos! ✅ Reserva confirmada.\n\nTe enviaremos un recordatorio 2 horas antes. ¡Hasta el viernes!' },
    ];
  }
  return [
    { role: 'customer', text: "Hi, I'd like to book a table for 4 on Friday at 8pm" },
    { role: 'ai', text: `Hello! Sure, let me check availability at ${name} for Friday, 4 guests at 8pm...` },
    { role: 'ai', text: `We have a table available! Can I confirm:\n\n📍 ${name}\n📅 Friday, ${friday}\n🕗 8:00 PM\n👥 4 guests\n\nWhat's your full name?` },
    { role: 'customer', text: 'John Smith' },
    { role: 'ai', text: "Perfect, John! ✅ Reservation confirmed.\n\nWe'll send a reminder 2 hours before. See you Friday!" },
  ];
}

export default function DemoWhatsAppSim({ restaurantName, lang }: DemoWhatsAppSimProps) {
  const t = labels[lang as keyof typeof labels] ?? labels.en;
  const messages = buildScript(restaurantName, lang);
  const [visibleCount, setVisibleCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPlaying || visibleCount >= messages.length) {
      if (visibleCount >= messages.length) setIsPlaying(false);
      return;
    }
    const delay = visibleCount === 0 ? 1000 : messages[visibleCount].role === 'ai' ? 2200 : 1400;
    const timer = setTimeout(() => setVisibleCount(c => c + 1), delay);
    return () => clearTimeout(timer);
  }, [visibleCount, isPlaying, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [visibleCount]);

  const handleReplay = () => { setVisibleCount(0); setIsPlaying(true); };

  const isTyping = isPlaying && visibleCount < messages.length;
  const nextIsAI = visibleCount < messages.length && messages[visibleCount].role === 'ai';

  return (
    <div className="max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 bg-[#075E54] text-white rounded-t-xl px-4 py-3">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
          IA
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">{t.title}</div>
          <div className="text-[10px] text-white/70">{isTyping && nextIsAI ? t.typing : t.subtitle}</div>
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald-400" />
      </div>

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="bg-[#ECE5DD] min-h-[360px] max-h-[420px] overflow-y-auto px-3 py-4 space-y-2"
      >
        <AnimatePresence mode="popLayout">
          {messages.slice(0, visibleCount).map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25 }}
              className={`flex ${msg.role === 'customer' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-3 py-2 rounded-lg text-[13px] leading-relaxed whitespace-pre-line ${
                  msg.role === 'customer'
                    ? 'bg-[#DCF8C6] text-[#111] rounded-tr-none'
                    : 'bg-white text-[#111] rounded-tl-none'
                }`}
              >
                {msg.text}
                <div className={`text-[10px] mt-1 text-right ${msg.role === 'customer' ? 'text-[#6B7C6B]' : 'text-muted-stone'}`}>
                  {`20:${String(i * 2 + 30).padStart(2, '0')}`}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {isTyping && nextIsAI && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
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
      </div>

      {/* Footer */}
      <div className="bg-[#F0F0F0] rounded-b-xl px-4 py-3 flex items-center justify-between border-t border-[#D1D5DB]">
        {!isPlaying && visibleCount >= messages.length ? (
          <button
            type="button"
            onClick={handleReplay}
            className="flex items-center gap-2 text-[13px] text-[#075E54] font-medium hover:text-[#064E46] transition-colors mx-auto"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M21 21v-5h-5" />
            </svg>
            {t.replay}
          </button>
        ) : (
          <div className="text-xs text-muted-stone mx-auto">
            {lang === 'pt-BR' ? 'Simulação de conversa com IA' : lang === 'es' ? 'Simulación de conversación con IA' : 'AI conversation simulation'}
          </div>
        )}
      </div>
    </div>
  );
}
