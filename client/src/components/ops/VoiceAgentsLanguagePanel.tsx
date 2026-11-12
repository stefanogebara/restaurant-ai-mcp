import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { GlassPanel } from '../common/glass';
import { useToast } from '../../contexts/ToastContext';

/**
 * Agentes de voz próprios × idioma do restaurante (founder-only).
 *
 * Mudar agent_language no banco não chega ao agente da ElevenLabs, e a chave
 * da ElevenLabs só existe no servidor. Este painel lê cada agente pelo
 * servidor (/api/elevenlabs-voice-settings?action=admin_language_report) e
 * sincroniza um restaurante por vez: idioma, modelo de voz compatível, idioma
 * do resumo, saudação e prompt — num único PATCH conferido depois.
 *
 * Também compara as instruções (prompt) e o fuso do agente com o que o
 * servidor monta hoje. O prompt é escrito uma vez; uma correção nele (12/11:
 * a data de hoje, que o agente chutava como 2023) só chega ao agente por
 * aqui. "Instruções antigas" troca só prompt e fuso, nunca o idioma — por
 * isso o botão em lote não toca agentes com idioma diferente.
 */

interface LanguageRow {
  restaurant_id: string;
  restaurant_name: string;
  agent_language: string;
  agent: { language: string | null; model: string | null; summary: string | null };
  status: 'ok' | 'mismatch' | 'outdated' | 'invalid' | 'error';
  reasons: string[];
}

const STATUS: Record<LanguageRow['status'], { label: string; tone: string }> = {
  ok: { label: 'Em dia', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  mismatch: { label: 'Diferente', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  outdated: { label: 'Instruções antigas', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  invalid: { label: 'Dados faltando', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  error: { label: 'Erro', tone: 'bg-red-50 text-red-700 border-red-200' },
};

export default function VoiceAgentsLanguagePanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [progress, setProgress] = useState<string | null>(null);
  const report = useQuery({
    queryKey: ['admin-voice-language'],
    queryFn: async () => (await api.get('/elevenlabs-voice-settings?action=admin_language_report')).data as { rows: LanguageRow[] },
    staleTime: 60_000,
  });
  const sync = useMutation({
    mutationFn: async (restaurantId: string) =>
      (await api.post(`/elevenlabs-voice-settings?action=admin_language_sync&restaurant_id=${encodeURIComponent(restaurantId)}`)).data,
    onSuccess: (data: { changed: boolean; after: LanguageRow }) => {
      toast.success(data.changed
        ? `${data.after.restaurant_name}: agente agora em ${data.after.agent.language}`
        : `${data.after.restaurant_name}: já estava em dia`);
      qc.invalidateQueries({ queryKey: ['admin-voice-language'] });
    },
    onError: () => toast.error('A sincronização falhou. Nada foi confirmado no agente.'),
  });
  // Um restaurante por vez, como as ferramentas: cada um é lido de volta.
  const refresh = useMutation({
    mutationFn: async (targets: LanguageRow[]) => {
      const failed: string[] = [];
      for (const [index, row] of targets.entries()) {
        setProgress(`${index + 1} de ${targets.length}: ${row.restaurant_name}`);
        try {
          await api.post(`/elevenlabs-voice-settings?action=admin_language_sync&restaurant_id=${encodeURIComponent(row.restaurant_id)}`);
        } catch { failed.push(row.restaurant_name); }
      }
      return { done: targets.length - failed.length, failed };
    },
    onSettled: () => { setProgress(null); qc.invalidateQueries({ queryKey: ['admin-voice-language'] }); },
    onSuccess: ({ done, failed }) => {
      if (failed.length) toast.error(`${done} atualizados; falharam: ${failed.join(', ')}`);
      else toast.success(`${done} agente(s) com instruções atualizadas`);
    },
  });

  const rows = report.data?.rows ?? [];
  const mismatched = rows.filter(row => row.status === 'mismatch').length;
  const outdated = rows.filter(row => row.status === 'outdated');
  const busy = sync.isPending || refresh.isPending;

  return (
    <GlassPanel className="p-5 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl text-deep-charcoal">Agentes de voz</h2>
          <p className="text-sm text-stone-500">
            Idioma, instruções e fuso de cada agente próprio na ElevenLabs comparados com o restaurante.
            {rows.length > 0 && ` ${rows.length} agentes, ${mismatched} fora do idioma, ${outdated.length} com instruções antigas.`}
          </p>
        </div>
        {outdated.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => refresh.mutate(outdated)}
            className="px-3.5 py-1.5 rounded-full text-sm font-medium bg-stone-800 text-white disabled:opacity-50"
          >
            Atualizar instruções ({outdated.length})
          </button>
        )}
      </header>

      {progress && <p className="text-sm text-stone-600" role="status">Atualizando {progress}…</p>}

      {report.isLoading && <p className="text-sm text-stone-500">Lendo os agentes…</p>}
      {report.isError && <p className="text-sm text-red-700">Não foi possível ler os agentes.</p>}

      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="py-2 pr-3 font-medium">Restaurante</th>
              <th className="py-2 pr-3 font-medium">Seatable</th>
              <th className="py-2 pr-3 font-medium">Agente</th>
              <th className="py-2 pr-3 font-medium">Situação</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.restaurant_id} className="border-t border-stone-200/70 align-top">
                <td className="py-2 pr-3 text-deep-charcoal">{row.restaurant_name}</td>
                <td className="py-2 pr-3 text-stone-600">{row.agent_language}</td>
                <td className="py-2 pr-3 text-stone-600">
                  {row.agent.language ?? '—'}
                  {row.agent.model && <span className="block text-xs text-stone-400">{row.agent.model}</span>}
                </td>
                <td className="py-2 pr-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full border text-xs ${STATUS[row.status].tone}`}>
                    {STATUS[row.status].label}
                  </span>
                  {row.reasons.length > 0 && <span className="block text-xs text-stone-400 mt-1">{row.reasons.join('; ')}</span>}
                </td>
                <td className="py-2 text-right">
                  {row.status === 'mismatch' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => sync.mutate(row.restaurant_id)}
                      className="px-3 py-1 rounded-full text-xs font-medium bg-stone-800 text-white disabled:opacity-50"
                    >
                      Sincronizar {row.restaurant_name}
                    </button>
                  )}
                  {row.status === 'outdated' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => refresh.mutate([row])}
                      className="px-3 py-1 rounded-full text-xs font-medium bg-white/70 border border-stone-300 text-stone-700 disabled:opacity-50"
                    >
                      Atualizar instruções de {row.restaurant_name}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </GlassPanel>
  );
}
