import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { GlassPanel, GlassCard } from '../common/glass';
import { useToast } from '../../contexts/ToastContext';
import { apiError, fmtTime } from './types';

/**
 * Treino (Gym, Phase 10): run persona scenarios against the REAL brain in a
 * sandbox, judge the transcript on the humanity rubric, and tune the versioned
 * style pack — activating a version updates the production prompt instantly.
 */

interface Scenario { id: string; nome: string; descricao: string | null; turns: number; }
interface RunSummary { id: string; scenario_id: string; style_version: number | null; media: number | null; scores: Scores | null; created_at: string; }
interface Scores {
  humanidade: number | null; naturalidade: number | null; sobriedade: number | null;
  bolhas: number | null; repeticao: number | null; avanco: number | null; adaptacao: number | null;
  media: number | null; tags: string[]; veredicto: string | null;
}
interface TranscriptItem { who: 'lead' | 'olimpia'; texto: string | null; acao?: string; }
interface StylePack { id: string; version: number; label: string | null; body: string; active: boolean; notes: string | null; }
interface GymData { scenarios: Scenario[]; runs: RunSummary[]; packs: StylePack[]; }
interface ExerciseResult { runId: string | null; transcript: TranscriptItem[]; scores: Scores | null; terminal: string | null; styleVersion: number | null; }

const RUBRICA_LABEL: Record<string, string> = {
  humanidade: 'Humanidade', naturalidade: 'Naturalidade', sobriedade: 'Sobriedade',
  bolhas: 'Bolhas', repeticao: 'Repetição', avanco: 'Avanço', adaptacao: 'Adaptação',
};

function scoreTone(v: number | null): string {
  if (v == null) return 'bg-stone-100 text-stone-500';
  if (v >= 4) return 'bg-emerald-100 text-emerald-800';
  if (v >= 3) return 'bg-amber-100 text-amber-800';
  return 'bg-rose-100 text-rose-800';
}

function Bubbles({ texto, who }: { texto: string; who: 'lead' | 'olimpia' }) {
  const parts = texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => (
        <div key={i} className={`flex ${who === 'olimpia' ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-[78%] rounded-2xl px-3 py-1.5 text-sm mb-1 ${who === 'olimpia' ? 'bg-emerald-50' : 'bg-stone-100'}`}>
            <p className="whitespace-pre-wrap break-words">{p}</p>
          </div>
        </div>
      ))}
    </>
  );
}

export default function GymPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [styleSel, setStyleSel] = useState<number | 'active'>('active');
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<ExerciseResult | null>(null);
  const [draft, setDraft] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const [showEditor, setShowEditor] = useState(false);

  const gymQ = useQuery({
    queryKey: ['prospect-admin', 'gym'],
    queryFn: async () => (await api.get<{ data: GymData }>('/prospect-admin?action=gym')).data.data,
    enabled: open,
    staleTime: 30000,
  });

  const exercise = useMutation({
    mutationFn: async (scenarioId: string) =>
      (await api.post<{ data: ExerciseResult }>('/prospect-admin?action=gym-exercise', {
        scenario_id: scenarioId,
        style_version: styleSel === 'active' ? undefined : styleSel,
      })).data.data,
    onMutate: (id) => setRunning(id),
    onSuccess: (data) => {
      setResult(data);
      setRunning(null);
      toast.success(`Treino concluído — média ${data.scores?.media ?? '—'}`);
      qc.invalidateQueries({ queryKey: ['prospect-admin', 'gym'] });
    },
    onError: (err: unknown) => { setRunning(null); toast.error(apiError(err) || 'Treino falhou'); },
  });

  const savePack = useMutation({
    mutationFn: async () =>
      (await api.post('/prospect-admin?action=style-pack-save', { body: draft, label: draftLabel || undefined })).data,
    onSuccess: () => {
      toast.success('Rascunho salvo como nova versão');
      setShowEditor(false); setDraft(''); setDraftLabel('');
      qc.invalidateQueries({ queryKey: ['prospect-admin', 'gym'] });
    },
    onError: (err: unknown) => toast.error(apiError(err) || 'Não foi possível salvar'),
  });

  const activate = useMutation({
    mutationFn: async (version: number) =>
      (await api.post('/prospect-admin?action=style-pack-activate', { version })).data,
    onSuccess: (_d, version) => {
      toast.success(`v${version} ATIVA — o cérebro em produção já usa este estilo`);
      qc.invalidateQueries({ queryKey: ['prospect-admin', 'gym'] });
    },
    onError: (err: unknown) => toast.error(apiError(err) || 'Não foi possível ativar'),
  });

  const d = gymQ.data;
  const lastRunFor = (scenarioId: string): RunSummary | undefined =>
    d?.runs.find((r) => r.scenario_id === scenarioId);

  return (
    <GlassPanel className="p-4">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left" aria-expanded={open}>
        <div>
          <h2 className="font-medium">Treino (Gym)</h2>
          <p className="text-xs text-stone-500">Cenários simulados contra o cérebro real + rubrica de humanidade + pacotes de estilo versionados</p>
        </div>
        <span className={`text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          {/* Style selector for runs */}
          {d && d.packs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
              treinar com estilo:
              <select
                value={String(styleSel)}
                onChange={(e) => setStyleSel(e.target.value === 'active' ? 'active' : Number(e.target.value))}
                className="rounded-lg border border-stone-200 bg-white/70 px-2 py-1"
              >
                <option value="active">ativo em produção</option>
                {d.packs.map((p) => (
                  <option key={p.id} value={p.version}>v{p.version} — {p.label || 'sem rótulo'}{p.active ? ' (ativa)' : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Scenarios */}
          {gymQ.isLoading && <p className="text-sm text-stone-500">Carregando…</p>}
          {d && (
            <div className="grid sm:grid-cols-2 gap-2">
              {d.scenarios.map((s) => {
                const last = lastRunFor(s.id);
                return (
                  <div key={s.id} className="rounded-xl border border-stone-200 bg-white/60 px-3 py-2 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{s.nome}</p>
                      <p className="text-[11px] text-stone-500 truncate">{s.descricao}</p>
                    </div>
                    {last && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${scoreTone(last.media)}`} title={`v${last.style_version ?? '—'} · ${fmtTime(last.created_at)}`}>
                        {last.media ?? '—'}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={!!running}
                      onClick={() => exercise.mutate(s.id)}
                      className="px-2.5 py-1 rounded-lg bg-burgundy text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 shrink-0"
                    >
                      {running === s.id ? 'Rodando…' : 'Rodar'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Latest result */}
          {result && (
            <GlassCard className="p-3 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(RUBRICA_LABEL).map(([k, label]) => (
                  <span key={k} className={`px-2 py-0.5 rounded-full text-xs font-medium ${scoreTone((result.scores as Record<string, number | null> | null)?.[k] ?? null)}`}>
                    {label} {(result.scores as Record<string, number | null> | null)?.[k] ?? '—'}
                  </span>
                ))}
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-stone-800 text-white">
                  média {result.scores?.media ?? '—'}
                </span>
                {result.terminal && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-sky-100 text-sky-800">→ {result.terminal}</span>
                )}
              </div>
              {result.scores?.veredicto && (
                <p className="text-xs text-stone-600 italic">“{result.scores.veredicto}”</p>
              )}
              <div className="max-h-72 overflow-y-auto rounded-xl bg-stone-50/60 p-3">
                {result.transcript.map((t, i) =>
                  t.texto ? (
                    <Bubbles key={i} texto={t.texto} who={t.who} />
                  ) : (
                    <p key={i} className="text-center text-[11px] text-stone-400 py-1">— ação: {t.acao} —</p>
                  ))}
              </div>
            </GlassCard>
          )}

          {/* Style packs */}
          {d && (
            <div className="pt-3 border-t border-stone-200/60 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-sm text-stone-700">Pacotes de estilo</h3>
                <button type="button" onClick={() => setShowEditor(!showEditor)} className="text-xs text-burgundy underline">
                  {showEditor ? 'fechar editor' : '+ novo rascunho'}
                </button>
              </div>
              {d.packs.map((p) => (
                <div key={p.id} className={`rounded-xl border px-3 py-2 ${p.active ? 'border-emerald-300 bg-emerald-50/50' : 'border-stone-200 bg-white/60'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold">v{p.version}</span>
                    <span className="text-xs text-stone-600 truncate">{p.label}</span>
                    {p.active && <span className="px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-medium">ATIVA</span>}
                    <span className="ml-auto flex gap-2 shrink-0">
                      <button type="button" className="text-xs text-stone-500 underline" onClick={() => { setDraft(p.body); setDraftLabel(`baseado em v${p.version}`); setShowEditor(true); }}>
                        editar como novo
                      </button>
                      {!p.active && (
                        <button type="button" disabled={activate.isPending} className="text-xs text-emerald-700 underline" onClick={() => activate.mutate(p.version)}>
                          ativar
                        </button>
                      )}
                    </span>
                  </div>
                  {p.notes && <p className="text-[11px] text-stone-400 mt-0.5">{p.notes}</p>}
                </div>
              ))}
              {showEditor && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                  <input
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    placeholder="rótulo (ex: v3 — menos exclamação)"
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/80"
                  />
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={10}
                    placeholder="ESTILO DE ESCRITA…"
                    className="w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-mono bg-white/80 resize-y"
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowEditor(false)} className="px-3 py-1.5 rounded-xl bg-stone-100 text-stone-600 text-sm hover:bg-stone-200">Cancelar</button>
                    <button
                      type="button"
                      disabled={savePack.isPending || !draft.trim()}
                      onClick={() => savePack.mutate()}
                      className="px-3 py-1.5 rounded-xl bg-burgundy text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      Salvar rascunho
                    </button>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-stone-400">
                Fluxo de treino: rodar cenários com um rascunho → comparar médias com a versão ativa → ativar quando vencer.
              </p>
            </div>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
