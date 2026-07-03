import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { GlassPanel } from '../common/glass';
import { useToast } from '../../contexts/ToastContext';
import type { Overview } from './types';
import { fmtTime } from './types';

/**
 * Number health (F5): quality rating dot + trailing failed rate + the
 * auto-pause banner when the circuit breaker trips. Recovery is deliberately
 * manual — auto-resume after a Meta flag is how numbers die.
 */

const RATING_DOT: Record<string, string> = {
  GREEN: 'bg-emerald-500', YELLOW: 'bg-amber-500', RED: 'bg-rose-600',
};
const RATING_LABEL: Record<string, string> = {
  GREEN: 'Boa', YELLOW: 'Atenção', RED: 'Crítica',
};

export function HealthInline({ ov }: { ov: Overview }) {
  const h = ov.health;
  return (
    <span
      className="flex items-center gap-1.5 text-xs text-stone-500"
      title={`${h.failed_24h} de ${h.sends_24h} mensagens falharam nas últimas 24h. A Meta rebaixa a saúde de números que recebem denúncias ou bloqueios — se cair para Atenção ou Crítica, reduza o ritmo de envios.`}
    >
      <span className={`w-2 h-2 rounded-full ${RATING_DOT[h.rating] ?? 'bg-stone-400'}`} />
      saúde do número: {RATING_LABEL[h.rating] ?? h.rating} · {h.failed_rate_24h}% de falhas nas últimas 24h
    </span>
  );
}

export function DispatchPausedBanner({ ov }: { ov: Overview }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [showEvents, setShowEvents] = useState(false);

  const resume = useMutation({
    mutationFn: async () => (await api.post('/prospect-admin?action=dispatch-resume', {})).data,
    onSuccess: () => {
      toast.success('Disparos reativados');
      qc.invalidateQueries({ queryKey: ['prospect-admin'] });
    },
    onError: () => toast.error('Não foi possível reativar'),
  });

  if (ov.dispatch_enabled) return null;
  return (
    <GlassPanel className="p-3 border border-rose-200 bg-rose-50/70">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-sm text-rose-800 font-medium"
          title="Disparo = envio em massa da primeira mensagem para novos leads"
        >
          🛑 Disparos pausados automaticamente
        </span>
        <span className="text-xs text-rose-700">{ov.dispatch_note || 'o sistema detectou risco para o número e pausou os envios por segurança'}</span>
        <button
          type="button"
          onClick={() => setShowEvents(!showEvents)}
          className="text-xs text-rose-700 underline"
        >
          {showEvents ? 'ocultar histórico' : 'ver histórico'}
        </button>
        <button
          type="button"
          disabled={resume.isPending}
          onClick={() => resume.mutate()}
          title="Volta a enviar as mensagens em massa. Use só depois de conferir que o problema foi resolvido."
          className="ml-auto px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          Reativar disparos
        </button>
      </div>
      <p className="text-xs text-stone-500">
        O que fazer: clique em "ver histórico" para entender o motivo da pausa. Quando o problema estiver resolvido, clique em "Reativar disparos" — a reativação é manual de propósito, para proteger o número no WhatsApp.
      </p>
      {showEvents && (
        <ul className="mt-2 space-y-0.5">
          {ov.health.events.map((e, i) => (
            <li key={i} className="text-xs text-stone-600">
              {fmtTime(e.created_at)} — {e.event_type}{e.rating ? ` (${e.rating})` : ''}{e.detail ? ` · ${e.detail}` : ''}
            </li>
          ))}
          {ov.health.events.length === 0 && <li className="text-xs text-stone-500">Nenhum evento registrado até agora.</li>}
        </ul>
      )}
    </GlassPanel>
  );
}
