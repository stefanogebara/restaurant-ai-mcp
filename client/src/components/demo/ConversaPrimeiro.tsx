import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DemoWhatsAppSim, { type DemoChatBooking } from './DemoWhatsAppSim';
import type { DemoStrings } from '../../hooks/useDemoLocale';

/**
 * Ato 1 do demo (plano Demo em Conversa, F2): no primeiro load de
 * /demo/:token o painel abre COBERTO por esta conversa. O dono fala com a
 * recepcionista IA dele como se fosse um cliente; quando ela fecha a
 * reserva, o overlay se despede e a reserva cai no painel — a promessa do
 * hero ("às 2 da manhã, sua IA atendeu") demonstrada ao vivo.
 *
 * O overlay nunca prende: "Pular e ver o painel" está sempre visível.
 * Depois do booking, a saída é convidada (não automática instantânea) para
 * o dono ler a confirmação da IA antes da transição.
 */

interface ConversaPrimeiroProps {
  restaurantName: string;
  lang: string;
  restaurantId?: string;
  presetKey?: string;
  t: DemoStrings;
  /** Chamado UMA vez, no fim: booking se a IA fechou reserva, null se pulou. */
  onDone: (booking: DemoChatBooking | null) => void;
}

export default function ConversaPrimeiro({
  restaurantName,
  lang,
  restaurantId,
  presetKey,
  t,
  onDone,
}: ConversaPrimeiroProps) {
  const [booking, setBooking] = useState<DemoChatBooking | null>(null);

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t.convTitle}
    >
      <div className="min-h-full flex items-center justify-center p-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-5">
            <p className="text-[11px] font-semibold tracking-[2px] uppercase text-white/70 mb-2">
              {t.convEyebrow}
            </p>
            <h2 className="font-serif text-[26px] leading-tight text-white text-balance">
              {t.convTitle}
            </h2>
          </div>

          <DemoWhatsAppSim
            restaurantName={restaurantName}
            lang={lang}
            restaurantId={restaurantId}
            presetKey={presetKey}
            onBooking={setBooking}
          />

          <AnimatePresence mode="wait">
            {booking ? (
              <motion.div
                key="booked"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 text-center"
              >
                <p className="text-sm text-emerald-300 font-medium mb-3">
                  ✓ {t.convBooked}
                </p>
                <button
                  type="button"
                  onClick={() => onDone(booking)}
                  className="px-8 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white text-[15px] font-semibold rounded-full transition-colors shadow-lg"
                >
                  {t.convBookedCta}
                </button>
              </motion.div>
            ) : (
              <motion.div key="skip" exit={{ opacity: 0 }} className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => onDone(null)}
                  className="text-[13px] text-white/60 hover:text-white/90 transition-colors underline underline-offset-4"
                >
                  {t.convSkip}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
