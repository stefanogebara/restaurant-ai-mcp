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
  GREEN: 'VERDE', YELLOW: 'AMARELA', RED: 'VERMELHA',
};

export function HealthInline({ ov }: { ov: Overview }) {
  const h = ov.health;
  return (
    <span className="flex items-center gap-1.5 text-xs text-stone-500" title={`falhas 24h: ${h.failed_24h}/${h.sends_24h}`}>
      <span className={`w-2 h-2 rounded-full ${RATING_DOT[h.rating] ?? 'bg-stone-400'}`} />
      qualidade {RATING_LABEL[h.rating] ?? h.rating} · falhas 24h {h.failed_rate_24h}%
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
        <span className="text-sm text-rose-800 font-medium">🛑 Disparos pausados automaticamente</span>
        <span className="text-xs text-rose-700">{ov.dispatch_note || 'circuito de proteção do número'}</span>
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
          className="ml-auto px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          Reativar disparos
        </button>
      </div>
      {showEvents && (
        <ul className="mt-2 space-y-0.5">
          {ov.health.events.map((e, i) => (
            <li key={i} className="text-xs text-stone-600">
              {fmtTime(e.created_at)} — {e.event_type}{e.rating ? ` (${e.rating})` : ''}{e.detail ? ` · ${e.detail}` : ''}
            </li>
          ))}
          {ov.health.events.length === 0 && <li className="text-xs text-stone-500">Sem eventos.</li>}
        </ul>
      )}
    </GlassPanel>
  );
}
