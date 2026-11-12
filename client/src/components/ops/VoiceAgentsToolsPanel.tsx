import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { GlassPanel } from '../common/glass';
import { useToast } from '../../contexts/ToastContext';

/**
 * Ferramentas dos agentes de voz próprios (founder-only).
 *
 * As ferramentas vivem na ElevenLabs e são criadas uma vez, junto com o
 * agente. Desde a auditoria de 11/11 a consulta de reserva pede o código
 * completo + telefone, e mudar/cancelar por telefone é recusado; agentes
 * antigos ainda descrevem a consulta "por telefone ou nome". Este painel
 * compara as três ferramentas de hóspede com a definição atual e atualiza um
 * agente por vez, conferindo cada ferramenta depois.
 */

interface ToolsRow {
  restaurant_id: string;
  restaurant_name: string;
  status: 'ok' | 'outdated' | 'invalid' | 'error';
  reasons: string[];
}

const STATUS: Record<ToolsRow['status'], { label: string; tone: string }> = {
  ok: { label: 'Em dia', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  outdated: { label: 'Desatualizadas', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  invalid: { label: 'Precisa de revisão', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
  error: { label: 'Erro', tone: 'bg-red-50 text-red-700 border-red-200' },
};

export default function VoiceAgentsToolsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [progress, setProgress] = useState<string | null>(null);
  const report = useQuery({
    queryKey: ['admin-voice-tools'],
    queryFn: async () => (await api.get('/elevenlabs-voice-settings?action=admin_tools_report')).data as { rows: ToolsRow[] },
    staleTime: 60_000,
  });
  const syncOne = (restaurantId: string) =>
    api.post(`/elevenlabs-voice-settings?action=admin_tools_sync&restaurant_id=${encodeURIComponent(restaurantId)}`);

  const sync = useMutation({
    mutationFn: async (rows: ToolsRow[]) => {
      const failed: string[] = [];
      for (const [index, row] of rows.entries()) {
        setProgress(`${index + 1} de ${rows.length}: ${row.restaurant_name}`);
        try { await syncOne(row.restaurant_id); } catch { failed.push(row.restaurant_name); }
      }
      return { done: rows.length - failed.length, failed };
    },
    onSettled: () => { setProgress(null); qc.invalidateQueries({ queryKey: ['admin-voice-tools'] }); },
    onSuccess: ({ done, failed }) => {
      if (failed.length) toast.error(`${done} atualizados; falharam: ${failed.join(', ')}`);
      else toast.success(`${done} agente(s) com ferramentas atualizadas`);
    },
  });

  const rows = report.data?.rows ?? [];
  const outdated = rows.filter(row => row.status === 'outdated');

  return (
    <GlassPanel className="p-5 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl text-deep-charcoal">Ferramentas dos agentes</h2>
          <p className="text-sm text-stone-500">
            Consulta, mudança e cancelamento de reserva de cada agente próprio comparados com a definição atual.
            {rows.length > 0 && ` ${rows.length} agentes, ${outdated.length} desatualizados.`}
          </p>
        </div>
        {outdated.length > 0 && (
          <button
            type="button"
            disabled={sync.isPending}
            onClick={() => sync.mutate(outdated)}
            className="px-3.5 py-1.5 rounded-full text-sm font-medium bg-stone-800 text-white disabled:opacity-50"
          >
            Atualizar todas ({outdated.length})
          </button>
        )}
      </header>

      {progress && <p className="text-sm text-stone-600" role="status">Atualizando {progress}…</p>}
      {report.isLoading && <p className="text-sm text-stone-500">Lendo as ferramentas…</p>}
      {report.isError && <p className="text-sm text-red-700">Não foi possível ler as ferramentas.</p>}

      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="py-2 pr-3 font-medium">Restaurante</th>
              <th className="py-2 pr-3 font-medium">Situação</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.restaurant_id} className="border-t border-stone-200/70 align-top">
                <td className="py-2 pr-3 text-deep-charcoal">{row.restaurant_name}</td>
                <td className="py-2 pr-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full border text-xs ${STATUS[row.status].tone}`}>
                    {STATUS[row.status].label}
                  </span>
                  {row.reasons.length > 0 && <span className="block text-xs text-stone-400 mt-1">{row.reasons.join('; ')}</span>}
                </td>
                <td className="py-2 text-right">
                  {row.status === 'outdated' && (
                    <button
                      type="button"
                      disabled={sync.isPending}
                      onClick={() => sync.mutate([row])}
                      className="px-3 py-1 rounded-full text-xs font-medium bg-white/70 border border-stone-300 text-stone-700 disabled:opacity-50"
                    >
                      Atualizar ferramentas de {row.restaurant_name}
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
