import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { GlassPanel, GlassCard } from '../common/glass';
import type { Insights } from './types';

/**
 * Insights (F7): mines the data the platform already writes — outcome quality
 * scores, theme tags, message timestamps — so the learning loop stops being
 * write-only. Benchmarks from cold-WhatsApp community baselines: 2% generic,
 * 4-6% personalized, 15-20% excellent reply rates.
 */

function Kpi({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <GlassCard className="px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-stone-400">{label}</p>
      <p className="font-serif text-2xl text-stone-800">{value}</p>
      {caption && <p className="text-[11px] text-stone-500 mt-0.5">{caption}</p>}
    </GlassCard>
  );
}

function replyBenchmark(rate: number | null): string | undefined {
  if (rate == null) return undefined;
  if (rate >= 15) return `${rate}% — nível excelente (15-20%)`;
  if (rate >= 4) return `${rate}% — acima do baseline genérico (2%), na faixa personalizada (4-6%)`;
  if (rate >= 2) return `${rate}% — no baseline genérico (2%); personalização melhora`;
  return `${rate}% — abaixo do baseline (2%); revisar abordagem`;
}

export default function InsightsPanel() {
  const [open, setOpen] = useState(false);
  const [dias, setDias] = useState(30);

  const q = useQuery({
    queryKey: ['prospect-admin', 'insights', dias],
    queryFn: async () => (await api.get<{ data: Insights }>(`/prospect-admin?action=insights&dias=${dias}`)).data.data,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const d = q.data;
  const maxTema = d?.temas?.length ? Math.max(...d.temas.map((t) => t.n)) : 0;

  return (
    <GlassPanel className="p-4">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left" aria-expanded={open}>
        <div>
          <h2 className="font-medium">Insights</h2>
          <p className="text-xs text-stone-500">O que as conversas estão ensinando: objeções, taxa de resposta, quais leads valem o cap</p>
        </div>
        <span className={`text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex gap-1.5">
            {[30, 60, 90].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDias(n)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium ${dias === n ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
              >
                {n}d
              </button>
            ))}
          </div>

          {q.isLoading && <p className="text-sm text-stone-500">Calculando…</p>}
          {d && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Kpi label="Contactados" value={String(d.contactados)} />
                <Kpi
                  label="Taxa de resposta"
                  value={d.taxa_resposta != null ? `${d.taxa_resposta}%` : '—'}
                  caption={replyBenchmark(d.taxa_resposta)}
                />
                <Kpi
                  label="1ª resposta (mediana)"
                  value={d.mediana_horas_primeira_resposta != null ? `${d.mediana_horas_primeira_resposta}h` : '—'}
                />
                <Kpi
                  label="Msgs até reunião (mediana)"
                  value={d.mediana_msgs_ate_reuniao != null ? String(Math.round(d.mediana_msgs_ate_reuniao)) : '—'}
                />
              </div>

              {d.temas.length > 0 && (
                <div>
                  <h3 className="font-serif text-sm text-stone-700 mb-1.5">Temas & objeções mais frequentes</h3>
                  <div className="space-y-1">
                    {d.temas.map((t) => (
                      <div key={t.tema} className="flex items-center gap-2 text-sm">
                        <span className="w-36 truncate text-stone-700">{t.tema}</span>
                        <div className="flex-1 h-3 rounded-full bg-stone-100 overflow-hidden">
                          <div className="h-full bg-amber-300" style={{ width: `${maxTema ? (100 * t.n) / maxTema : 0}%` }} />
                        </div>
                        <span className="w-8 text-right text-stone-600">{t.n}</span>
                        <span className={`w-10 text-right text-xs ${t.delta > 0 ? 'text-rose-600' : t.delta < 0 ? 'text-emerald-600' : 'text-stone-400'}`}>
                          {t.delta > 0 ? `+${t.delta}` : t.delta < 0 ? String(t.delta) : '='}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {d.segmentos.length > 0 && (
                <div>
                  <h3 className="font-serif text-sm text-stone-700 mb-1.5">Segmentos (variante × faixa de score)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-stone-400 text-left">
                          <th className="py-1 pr-3">Variante</th>
                          <th className="py-1 pr-3">Score</th>
                          <th className="py-1 pr-3">Leads</th>
                          <th className="py-1 pr-3">Reuniões</th>
                          <th className="py-1">Qualidade média</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.segmentos.map((s, i) => (
                          <tr key={i}>
                            <td className="py-1 pr-3 font-mono">{s.variant}</td>
                            <td className="py-1 pr-3">{s.score_band}</td>
                            <td className="py-1 pr-3">{s.leads}</td>
                            <td className="py-1 pr-3">{s.booked}</td>
                            <td className={`py-1 font-medium ${
                              s.avg_quality == null ? 'text-stone-400'
                                : s.avg_quality >= 4 ? 'text-emerald-700'
                                : s.avg_quality >= 3 ? 'text-stone-700' : 'text-rose-700'
                            }`}>
                              {s.avg_quality ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {d.contactados === 0 && (
                <p className="text-sm text-stone-500">Sem dados suficientes na janela — os insights acumulam conforme as conversas acontecem.</p>
              )}
            </>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
