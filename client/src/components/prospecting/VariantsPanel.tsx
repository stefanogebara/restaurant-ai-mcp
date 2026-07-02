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
  1: 'Toque 1 — introdução',
  2: 'Toque 2 — retomada (D+3)',
  3: 'Toque 3 — despedida (D+8)',
};

function pct(n: number, of: number): string {
  if (!of) return '—';
  return `${Math.round((100 * n) / of)}%`;
}

export default function VariantsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<TemplateRow> | null>(null);

  const q = useQuery({
    queryKey: ['prospect-admin', 'variants'],
    queryFn: async () =>
      (await api.get<{ data: { templates: TemplateRow[]; funnel: VariantFunnelRow[] } }>(
        '/prospect-admin?action=variants',
      )).data.data,
    enabled: open,
    refetchInterval: open ? 60000 : false,
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
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left" aria-expanded={open}>
        <div>
          <h2 className="font-medium">Abordagens (A/B)</h2>
          <p className="text-xs text-stone-500">Variantes de template aprovadas na Meta + funil por variante e toques de follow-up</p>
        </div>
        <span className={`text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
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
                    + registrar template
                  </button>
                </div>
                {rows.length === 0 && (
                  <p className="text-xs text-stone-400">
                    {touch === 1
                      ? 'Nenhuma registrada — o disparo usa o template do ambiente (olimpia_intro).'
                      : 'Nenhum template registrado — este toque fica em espera até registrar um aprovado.'}
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
                O template precisa estar APROVADO no WhatsApp Manager antes de registrar aqui — toques frios saem fora da janela de 24h.
              </p>
              <div className="grid sm:grid-cols-3 gap-2">
                <label className="text-xs text-stone-500">
                  Variante (A, B, C…)
                  <input
                    value={editing.variant_label ?? ''}
                    onChange={(e) => setEditing({ ...editing, variant_label: e.target.value.toUpperCase().slice(0, 2) })}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/80"
                  />
                </label>
                <label className="text-xs text-stone-500 sm:col-span-2">
                  Nome do template na Meta
                  <input
                    value={editing.meta_template_name ?? ''}
                    onChange={(e) => setEditing({ ...editing, meta_template_name: e.target.value.trim() })}
                    placeholder="olimpia_intro_b"
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/80 font-mono"
                  />
                </label>
              </div>
              <label className="text-xs text-stone-500 block">
                Prévia do corpo (para o console)
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
              <h3 className="font-serif text-sm text-stone-700 mb-1.5">Funil por variante</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-stone-400 text-left">
                      <th className="py-1 pr-3">Variante</th>
                      <th className="py-1 pr-3">Enviado</th>
                      <th className="py-1 pr-3">Entregue</th>
                      <th className="py-1 pr-3">Lido</th>
                      <th className="py-1 pr-3">Respondeu</th>
                      <th className="py-1 pr-3">Reunião</th>
                      <th className="py-1 pr-3">Opt-out</th>
                      <th className="py-1">Qualidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.map((f) => {
                      const isBest = f.sent > 0 && f.replied / f.sent === bestReplied && bestReplied > 0;
                      return (
                        <tr key={f.variant} className={isBest ? 'ring-1 ring-emerald-300 rounded-lg' : ''}>
                          <td className="py-1.5 pr-3 font-mono font-medium">{f.variant}</td>
                          <td className="py-1.5 pr-3">{f.sent}</td>
                          <td className="py-1.5 pr-3" title={String(f.delivered)}>{pct(f.delivered, f.sent)}</td>
                          <td className="py-1.5 pr-3" title={String(f.read)}>{pct(f.read, f.sent)}</td>
                          <td className="py-1.5 pr-3 font-medium" title={String(f.replied)}>{pct(f.replied, f.sent)}</td>
                          <td className="py-1.5 pr-3" title={String(f.booked)}>{pct(f.booked, f.sent)}</td>
                          <td className="py-1.5 pr-3" title={String(f.optout)}>{pct(f.optout, f.sent)}</td>
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
      )}
    </GlassPanel>
  );
}
