import { useState } from 'react';
import { motion } from 'framer-motion';
import TestarNoMeuWhatsApp from './TestarNoMeuWhatsApp';
import { trackDemoFunnel } from '../../lib/analytics';
import type { DemoStrings } from '../../hooks/useDemoLocale';

/**
 * Captura DEPOIS do aha (Demo em Conversa, F3 — decisão D2).
 *
 * Aparece só quando a recepcionista IA acabou de fechar uma reserva na frente
 * do dono (chatBooking setado no DemoDashboard). A hierarquia é deliberada:
 * WhatsApp real primeiro (alta intenção; rate limits demo_wa_* capam o custo),
 * e-mail como fallback discreto via /api/demo/attach-contact. Nenhum campo é
 * obrigatório — o demo continua funcionando se o dono ignorar tudo.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface CapturaPosAhaProps {
  demoToken: string;
  restaurantId?: string;
  restaurantName: string;
  lang: string;
  t: DemoStrings;
}

type EmailEstado = 'fechado' | 'aberto' | 'enviando' | 'enviado' | 'erro';

export default function CapturaPosAha({ demoToken, restaurantId, restaurantName, lang, t }: CapturaPosAhaProps) {
  const [emailEstado, setEmailEstado] = useState<EmailEstado>('fechado');
  const [email, setEmail] = useState('');

  async function enviarEmail() {
    const trimmed = email.trim();
    if (!trimmed || emailEstado === 'enviando') return;
    setEmailEstado('enviando');
    try {
      const r = await fetch(`${API_BASE}/api/demo/attach-contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demo_token: demoToken, contact_email: trimmed }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) {
        setEmailEstado('erro');
        return;
      }
      trackDemoFunnel({ step: 'demo_contact_captured' });
      setEmailEstado('enviado');
    } catch {
      setEmailEstado('erro');
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.5 }}
      className="glass-card p-4 space-y-3"
    >
      <p className="text-sm font-semibold text-deep-charcoal">{t.captureTitle}</p>

      <TestarNoMeuWhatsApp restaurantId={restaurantId} restaurantName={restaurantName} lang={lang} />

      {emailEstado === 'enviado' ? (
        <p className="text-xs text-emerald-700">{t.captureEmailDone}</p>
      ) : emailEstado === 'fechado' ? (
        <button
          type="button"
          onClick={() => setEmailEstado('aberto')}
          className="text-xs text-muted-stone hover:text-stone-gray underline underline-offset-2"
        >
          {t.captureEmailToggle}
        </button>
      ) : (
        <div>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (emailEstado === 'erro') setEmailEstado('aberto'); }}
              placeholder="seu@email.com"
              aria-label={t.captureEmailToggle}
              className="min-w-0 flex-1 rounded-lg border border-glass-border-input bg-white px-3 py-2 text-sm text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy"
            />
            <button
              type="button"
              onClick={enviarEmail}
              disabled={!email.trim() || emailEstado === 'enviando'}
              className="shrink-0 rounded-lg bg-burgundy px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {t.captureEmailSend}
            </button>
          </div>
          {emailEstado === 'erro' && (
            <p className="mt-1.5 text-xs text-red-600">{t.captureEmailError}</p>
          )}
        </div>
      )}
    </motion.div>
  );
}
