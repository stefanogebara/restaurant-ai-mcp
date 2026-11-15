import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { GlassPanel } from '../common/glass';
import { useToast } from '../../contexts/ToastContext';

/**
 * Sobras de ferramentas na ElevenLabs (founder-only).
 *
 * Até o PR #342 (15/11/2026), apagar um agente deixava as 7 ferramentas dele
 * na conta. Em 15/11 eram 758 ferramentas; ~396 de 63 restaurantes que não
 * existem mais. Este painel conta pelo servidor (só ids e números) e apaga em
 * lotes de 25. O servidor confere cada id de novo: só sai a ferramenta cujos
 * agentes dependentes respondem 404 — qualquer outra resposta a mantém.
 *
 * "Sem restaurante" é um grupo à parte: pode haver agente vivo usando.
 */

type Bucket = 'missing_restaurant' | 'unscoped';

interface OrphanList {
  counts: { total: number; existing_restaurant: number; missing_restaurant: number; missing_restaurants: number; unscoped: number; foreign_host: number; not_webhook: number };
  missing_restaurant: string[];
  unscoped: string[];
}

interface Summary { deleted: number; already_gone: number; kept_in_use: number; refused: number; failed: number; dependent_agent_statuses: Record<string, number> }

const BATCH = 25;
const emptySummary = (): Summary => ({ deleted: 0, already_gone: 0, kept_in_use: 0, refused: 0, failed: 0, dependent_agent_statuses: {} });

export default function VoiceAgentsOrphanToolsPanel() {
  const toast = useToast();
  const [progress, setProgress] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ bucket: Bucket; summary: Summary } | null>(null);
  const list = useQuery({
    queryKey: ['admin-voice-orphan-tools'],
    queryFn: async () => (await api.get('/elevenlabs-voice-settings?action=admin_tools_orphans')).data as OrphanList,
    enabled: false,
  });

  const run = useMutation({
    mutationFn: async ({ bucket, ids }: { bucket: Bucket; ids: string[] }) => {
      const total = emptySummary();
      const batches = Math.ceil(ids.length / BATCH);
      for (let i = 0; i < batches; i += 1) {
        setProgress(`lote ${i + 1} de ${batches}`);
        const { data } = await api.post('/elevenlabs-voice-settings?action=admin_tools_orphans_delete',
          { bucket, tool_ids: ids.slice(i * BATCH, (i + 1) * BATCH) });
        const s = data.summary as Summary;
        (['deleted', 'already_gone', 'kept_in_use', 'refused', 'failed'] as const).forEach(k => { total[k] += s[k]; });
        Object.entries(s.dependent_agent_statuses || {}).forEach(([status, n]) => {
          total.dependent_agent_statuses[status] = (total.dependent_agent_statuses[status] || 0) + n;
        });
      }
      return { bucket, summary: total };
    },
    onSuccess: result => {
      setLastRun(result);
      toast.success(`${result.summary.deleted} ferramentas apagadas`);
    },
    onError: () => toast.error('A limpeza parou no meio. O que já foi apagado está apagado; conte de novo.'),
    onSettled: () => { setProgress(null); list.refetch(); },
  });

  const counts = list.data?.counts;
  const busy = run.isPending || list.isFetching;

  return (
    <GlassPanel className="p-5 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl text-deep-charcoal">Sobras de ferramentas</h2>
          <p className="text-sm text-stone-500">
            Ferramentas na ElevenLabs de restaurantes que não existem mais. Só sai a que nenhum agente vivo usa.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => list.refetch()}
          className="px-3.5 py-1.5 rounded-full text-sm font-medium bg-white/70 border border-stone-300 text-stone-700 disabled:opacity-50"
        >
          {list.data ? 'Contar de novo' : 'Contar sobras'}
        </button>
      </header>

      {list.isFetching && <p className="text-sm text-stone-500">Lendo todas as ferramentas…</p>}
      {list.isError && <p className="text-sm text-red-700">Não foi possível ler as ferramentas.</p>}
      {progress && <p className="text-sm text-stone-600" role="status">Apagando: {progress}…</p>}

      {counts && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-stone-500">Total</dt><dd className="text-deep-charcoal">{counts.total}</dd>
          <dt className="text-stone-500">De restaurantes vivos</dt><dd className="text-deep-charcoal">{counts.existing_restaurant}</dd>
          <dt className="text-stone-500">De restaurantes que não existem</dt>
          <dd className="text-deep-charcoal">{counts.missing_restaurant} ({counts.missing_restaurants} restaurantes)</dd>
          <dt className="text-stone-500">Sem restaurante</dt><dd className="text-deep-charcoal">{counts.unscoped}</dd>
          <dt className="text-stone-500">De outro projeto ou outro tipo</dt><dd className="text-deep-charcoal">{counts.foreign_host + counts.not_webhook}</dd>
        </dl>
      )}

      {list.data && (
        <div className="flex flex-wrap gap-2">
          {list.data.missing_restaurant.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run.mutate({ bucket: 'missing_restaurant', ids: list.data!.missing_restaurant })}
              className="px-3.5 py-1.5 rounded-full text-sm font-medium bg-stone-800 text-white disabled:opacity-50"
            >
              Apagar {list.data.missing_restaurant.length} de restaurantes que não existem
            </button>
          )}
          {list.data.unscoped.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run.mutate({ bucket: 'unscoped', ids: list.data!.unscoped })}
              className="px-3.5 py-1.5 rounded-full text-sm font-medium bg-white/70 border border-amber-300 text-amber-800 disabled:opacity-50"
            >
              Apagar {list.data.unscoped.length} sem restaurante
            </button>
          )}
        </div>
      )}

      {lastRun && (
        <p className="text-sm text-stone-600" role="status">
          Última limpeza ({lastRun.bucket === 'unscoped' ? 'sem restaurante' : 'restaurantes que não existem'}):{' '}
          {lastRun.summary.deleted} apagadas, {lastRun.summary.already_gone} já não existiam,{' '}
          {lastRun.summary.kept_in_use} mantidas em uso, {lastRun.summary.refused} recusadas, {lastRun.summary.failed} falhas.
          {Object.keys(lastRun.summary.dependent_agent_statuses).length > 0 && (
            <span className="block text-xs text-stone-400 mt-1">
              Agentes dependentes: {Object.entries(lastRun.summary.dependent_agent_statuses).map(([s, n]) => `${s} ×${n}`).join(', ')}
            </span>
          )}
        </p>
      )}
    </GlassPanel>
  );
}
