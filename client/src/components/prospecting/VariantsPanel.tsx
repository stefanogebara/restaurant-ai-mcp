import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { GlassPanel } from '../common/glass';
import { useToast } from '../../contexts/ToastContext';
import type { TemplateRow, VariantFunnelRow } from './types';

/**
 * "Abordagens" (F2 + F4): the Meta-approved template registry (intro variants +
 * follow-up touches) and the per-variant funnel. Templates are APPROVED in
 * WhatsApp Manager first, then registered here by name — cold touches happen
 * outside the 24h window, so free-text bodies are not an option (Meta policy).
 */

const TOUCH_LABEL: Record<number, string> = {
  1: 'Toque 1 — primeira mensagem',
  2: 'Toque 2 — lembrete (3 dias depois)',
  3: 'Toque 3 — despedida (8 dias depois)',
};

function pct(n: number, of: number): string {
  if (!of) return '—';
  return `${Math.round((100 * n) / of)}%`;
}

export default function VariantsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Partial<TemplateRow> | null>(null);

  const q = useQuery({
    queryKey: ['prospect-admin', 'variants'],
    queryFn: async () =>
      (await api.get<{ data: { templates: TemplateRow[]; funnel: VariantFunnelRow[] } }>(
        '/prospect-admin?action=variants',
      )).data.data,
    refetchInterval: 60000,
  });

  const upsert = useMutation({
    mutationFn: async (row: Partial<TemplateRow>) =>
      (await api.post('/prospect-admin?action=template-upsert', row)).data,
    onSuccess: () => {
      toast.success('Abordagem salva');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['prospect-admin', 'variants'] });
    },
    onError: () => toast.error('Não foi possível salvar'),
  });

  const templates = q.data?.templates ?? [];
  const funnel = q.data?.funnel ?? [];
  const bestReplied = funnel.length
    ? Math.max(...funnel.map((f) => (f.sent ? f.replied / f.sent : 0)))
    : 0;

  return (
    <GlassPanel className="p-4">
      <div>
        <h2 className="font-medium">Abordagens (A/B)</h2>
        <p className="text-xs text-stone-500">Teste A/B: duas primeiras mensagens competindo — a que gera mais resposta vence. Cada abordagem usa um modelo aprovado (Meta) e pode ter lembretes (toques 2 e 3).</p>
      </div>

      <div className="mt-4 space-y-5">
          {/* Registry grouped by touch */}
          {[1, 2, 3].map((touch) => {
            const rows = templates.filter((t) => t.touch_number === touch);
            return (
              <div key={touch}>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="font-serif text-sm text-stone-700">{TOUCH_LABEL[touch]}</h3>
                  <button
                    type="button"
                    onClick={() => setEditing({ touch_number: touch, variant_label: '', meta_template_name: '', body_preview: '', active: true })}
                    className="text-xs text-burgundy underline"
                  >
                    + registrar modelo
                  </button>
                </div>
                {rows.length === 0 && (
                  <p className="text-xs text-stone-400">
                    {touch === 1
                      ? 'Nenhuma abordagem registrada — o disparo (envio em massa da primeira mensagem) usa o modelo padrão do sistema (olimpia_intro).'
                      : 'Nenhum modelo registrado — este lembrete fica em espera até você registrar um modelo aprovado pela Meta.'}
                  </p>
                )}
                <div className="space-y-1.5">
                  {rows.map((t) => (
                    <div key={t.id} className={`rounded-xl border px-3 py-2 ${t.active ? 'border-stone-200 bg-white/60' : 'border-stone-100 bg-stone-50 opacity-60'}`}>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg bg-stone-800 text-white text-xs font-mono">{t.variant_label}</span>
                        <span className="text-xs font-mono text-stone-600">{t.meta_template_name}</span>
                        {!t.active && <span className="text-[10px] uppercase text-stone-400">inativa</span>}
                        <span className="ml-auto flex gap-2">
                          <button type="button" className="text-xs text-stone-500 underline" onClick={() => setEditing(t)}>editar</button>
                          <button
                            type="button"
                            className="text-xs text-stone-500 underline"
                            onClick={() => upsert.mutate({ ...t, active: !t.active })}
                          >
                            {t.active ? 'desativar' : 'ativar'}
                          </button>
                        </span>
                      </div>
                      {t.body_preview && <p className="text-xs text-stone-500 mt-1 line-clamp-2">{t.body_preview}</p>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Editor */}
          {editing && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
              <p className="text-xs text-amber-800">
                O modelo precisa estar APROVADO pela Meta (no WhatsApp Manager) antes de ser registrado aqui. Motivo: o WhatsApp só permite texto livre até 24h após a última mensagem do lead — fora dessa janela de 24h, só sai modelo aprovado.
              </p>
              <div className="grid sm:grid-cols-3 gap-2">
                <label className="text-xs text-stone-500">
                  Abordagem (A, B, C…)
                  <input
                    value={editing.variant_label ?? ''}
                    onChange={(e) => setEditing({ ...editing, variant_label: e.target.value.toUpperCase().slice(0, 2) })}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/80"
                  />
                </label>
                <label className="text-xs text-stone-500 sm:col-span-2">
                  Nome do modelo na Meta (exatamente como aprovado)
                  <input
                    value={editing.meta_template_name ?? ''}
                    onChange={(e) => setEditing({ ...editing, meta_template_name: e.target.value.trim() })}
                    placeholder="olimpia_intro_b"
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/80 font-mono"
                  />
                </label>
              </div>
              <label className="text-xs text-stone-500 block">
                Prévia da mensagem (só para exibir aqui no painel)
                <textarea
                  value={editing.body_preview ?? ''}
                  onChange={(e) => setEditing({ ...editing, body_preview: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/80 resize-none"
                />
              </label>
              {editing.touch_number === 1 && /https?:\/\/|www\./i.test(editing.body_preview || '') && (
                <p className="text-xs text-rose-700">
                  ⚠ Link no primeiro contato é o maior gatilho de bloqueio — considere tirar a URL do toque 1.
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-xl bg-stone-100 text-stone-600 text-sm hover:bg-stone-200">Cancelar</button>
                <button
                  type="button"
                  disabled={upsert.isPending || !editing.variant_label || !editing.meta_template_name}
                  onClick={() => upsert.mutate(editing)}
                  className="px-3 py-1.5 rounded-xl bg-burgundy text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  Salvar
                </button>
              </div>
            </div>
          )}

          {/* Per-variant funnel */}
          {funnel.length > 0 && (
            <div>
              <h3 className="font-serif text-sm text-stone-700 mb-1.5">Funil por abordagem</h3>
              <p className="text-xs text-stone-500">Compare as abordagens lado a lado — a que gera mais resposta vence (linha destacada em verde). Passe o mouse nos percentuais para ver os números.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-stone-400 text-left">
                      <th className="py-1 pr-3">Abordagem</th>
                      <th className="py-1 pr-3">Enviadas</th>
                      <th className="py-1 pr-3">Entregues</th>
                      <th className="py-1 pr-3">Lidas</th>
                      <th className="py-1 pr-3">Responderam</th>
                      <th className="py-1 pr-3">Reunião</th>
                      <th className="py-1 pr-3" title="Leads que pediram pra sair da lista (LGPD)">Pediram pra sair</th>
                      <th className="py-1" title="Nota média de qualidade das conversas desta abordagem">Qualidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.map((f) => {
                      const isBest = f.sent > 0 && f.replied / f.sent === bestReplied && bestReplied > 0;
                      return (
                        <tr key={f.variant} className={isBest ? 'ring-1 ring-emerald-300 rounded-lg' : ''} title={isBest ? 'Melhor abordagem até agora — maior taxa de resposta' : undefined}>
                          <td className="py-1.5 pr-3 font-mono font-medium">{f.variant}</td>
                          <td className="py-1.5 pr-3" title={`${f.sent} mensagens enviadas`}>{f.sent}</td>
                          <td className="py-1.5 pr-3" title={`${f.delivered} de ${f.sent} entregues`}>{pct(f.delivered, f.sent)}</td>
                          <td className="py-1.5 pr-3" title={`${f.read} de ${f.sent} lidas`}>{pct(f.read, f.sent)}</td>
                          <td className="py-1.5 pr-3 font-medium" title={`${f.replied} de ${f.sent} responderam`}>{pct(f.replied, f.sent)}</td>
                          <td className="py-1.5 pr-3" title={`${f.booked} de ${f.sent} marcaram reunião`}>{pct(f.booked, f.sent)}</td>
                          <td className="py-1.5 pr-3" title={`${f.optout} de ${f.sent} pediram pra sair`}>{pct(f.optout, f.sent)}</td>
                          <td className="py-1.5">{f.avg_quality ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
    </GlassPanel>
  );
}
