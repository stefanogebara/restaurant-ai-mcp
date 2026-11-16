import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../services/api';
import { GlassPanel } from '../common/glass';
import { useToast } from '../../contexts/ToastContext';

/**
 * Agentes antigos de restaurantes apagados (founder-only, 16/11/2026).
 *
 * Até o PR #342 um agente podia sobreviver ao restaurante; as dezenas de
 * agentes de teste de maio prendiam 336 ferramentas na conta. Este painel
 * classifica pelo servidor, página por página e sem apagar nada; depois apaga
 * em lotes de 5. O servidor confere cada agente de novo antes de apagar e
 * nunca usa force. Ficam sempre: os nomes escolhidos pelo Stefano, os agentes
 * das configurações do app, os ligados a um restaurante, os com número de
 * telefone, os com chamada nos últimos 30 dias e os sem prova ("sem prova").
 */

interface AgentRow { agent_id: string; name: string; bucket: string; reason: string | null; missing_restaurants: number }

const LABEL: Record<string, string> = {
  orphan: 'De restaurantes que não existem',
  kept_named: 'Mantidos pela sua lista',
  kept_app_setting: 'Mantidos: configuração do app',
  kept_linked: 'Mantidos: ligados a um restaurante',
  kept_phone: 'Mantidos: têm número de telefone',
  kept_recent_call: 'Mantidos: chamada nos últimos 30 dias',
  unproven: 'Mantidos: sem prova de que são de restaurante apagado',
};
const BATCH = 5;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function VoiceAgentsOrphanAgentsPanel() {
  const toast = useToast();
  const [rows, setRows] = useState<AgentRow[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const classify = useMutation({
    mutationFn: async () => {
      const all: AgentRow[] = [];
      let cursor: string | null = '';
      for (let page = 1; cursor !== null && page <= 50; page += 1) {
        setProgress(`lendo página ${page} de agentes`);
        const { data } = await api.get(`/elevenlabs-voice-settings?action=admin_agents_orphans${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
        all.push(...(data.rows as AgentRow[]));
        cursor = data.next_cursor || null;
        if (cursor) await sleep(1500);
      }
      return all;
    },
    onSuccess: setRows,
    onError: () => toast.error('Não foi possível ler os agentes.'),
    onSettled: () => setProgress(null),
  });

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      const total: Record<string, number> = {};
      const bad: string[] = [];
      const batches = Math.ceil(ids.length / BATCH);
      for (let i = 0; i < batches; i += 1) {
        setProgress(`apagando lote ${i + 1} de ${batches}`);
        const { data } = await api.post('/elevenlabs-voice-settings?action=admin_agents_orphans_delete', { agent_ids: ids.slice(i * BATCH, (i + 1) * BATCH) });
        for (const r of data.results as { outcome: string; name?: string; id: string; status?: number; bucket?: string }[]) {
          total[r.outcome] = (total[r.outcome] || 0) + 1;
          if (r.outcome !== 'deleted' && r.outcome !== 'already_gone') bad.push(`${r.name || r.id}: ${r.bucket || r.outcome}${r.status ? ` (${r.status})` : ''}`);
        }
        if (i < batches - 1) await sleep(3000);
      }
      return { total, bad };
    },
    onSuccess: ({ total, bad }) => { setResult(total); setProblems(bad); toast.success(`${total.deleted || 0} agentes apagados`); },
    onError: () => toast.error('A limpeza parou no meio. O que já foi apagado está apagado; classifique de novo.'),
    onSettled: () => setProgress(null),
  });

  const busy = classify.isPending || remove.isPending;
  const groups = (rows || []).reduce<Record<string, AgentRow[]>>((acc, row) => { (acc[row.bucket] = acc[row.bucket] || []).push(row); return acc; }, {});
  const orphans = groups.orphan || [];

  return (
    <GlassPanel className="p-5 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl text-deep-charcoal">Agentes de restaurantes apagados</h2>
          <p className="text-sm text-stone-500">Só sai o agente cujas ferramentas apontam apenas para restaurantes que não existem mais.</p>
        </div>
        <button type="button" disabled={busy} onClick={() => classify.mutate()}
          className="px-3.5 py-1.5 rounded-full text-sm font-medium bg-white/70 border border-stone-300 text-stone-700 disabled:opacity-50">
          {rows ? 'Classificar de novo' : 'Classificar agentes'}
        </button>
      </header>

      {progress && <p className="text-sm text-stone-600" role="status">{progress}…</p>}

      {rows && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-stone-500">Total de agentes</dt><dd className="text-deep-charcoal">{rows.length}</dd>
          {Object.keys(LABEL).filter(bucket => groups[bucket]?.length).map(bucket => (
            <div key={bucket} className="contents">
              <dt className="text-stone-500">{LABEL[bucket]}</dt><dd className="text-deep-charcoal">{groups[bucket].length}</dd>
            </div>
          ))}
        </dl>
      )}

      {orphans.length > 0 && (
        <details className="text-sm text-stone-600">
          <summary className="cursor-pointer">Ver os {orphans.length} agentes que sairiam</summary>
          <ul className="mt-2 columns-2 gap-6">{orphans.map(a => <li key={a.agent_id}>{a.name}</li>)}</ul>
        </details>
      )}
      {(groups.unproven || []).length > 0 && (
        <details className="text-sm text-stone-600">
          <summary className="cursor-pointer">Ver os {groups.unproven.length} mantidos sem prova</summary>
          <ul className="mt-2 columns-2 gap-6">{groups.unproven.map(a => <li key={a.agent_id}>{a.name}</li>)}</ul>
        </details>
      )}

      {orphans.length > 0 && (
        <button type="button" disabled={busy} onClick={() => remove.mutate(orphans.map(a => a.agent_id))}
          className="px-3.5 py-1.5 rounded-full text-sm font-medium bg-stone-800 text-white disabled:opacity-50">
          Apagar {orphans.length} agentes de restaurantes que não existem
        </button>
      )}

      {result && (
        <p className="text-sm text-stone-600" role="status">
          Última limpeza: {result.deleted || 0} apagados, {result.already_gone || 0} já não existiam, {result.kept || 0} mantidos na reconferência,{' '}
          {result.refused_by_elevenlabs || 0} recusados pela ElevenLabs, {result.failed || 0} falhas.
          {problems.length > 0 && <span className="block text-xs text-stone-400 mt-1">{problems.join('; ')}</span>}
        </p>
      )}
    </GlassPanel>
  );
}
