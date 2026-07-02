import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { GlassPanel } from '../common/glass';
import { useToast } from '../../contexts/ToastContext';

/**
 * Discovery + mass-dispatch panel (Phase 9).
 *
 * Three territory modes:
 *   Bairro  — quick single search (60 results via pagination), inline result.
 *   Cidade  — IBGE districts fan-out; runs as a background JOB with progress.
 *   Estado  — every municipality of the UF (IBGE); JOB, capped by max queries.
 *
 * "Só com WhatsApp" (default ON) discards leads whose Google phone is not a BR
 * mobile — if we can't message them, they don't enter the pool.
 */

const REGIOES: Array<{ nome: string; ufs: string[] }> = [
  { nome: 'Norte', ufs: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'] },
  { nome: 'Nordeste', ufs: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'] },
  { nome: 'Centro-Oeste', ufs: ['DF', 'GO', 'MS', 'MT'] },
  { nome: 'Sudeste', ufs: ['ES', 'MG', 'RJ', 'SP'] },
  { nome: 'Sul', ufs: ['PR', 'RS', 'SC'] },
];

type Mode = 'bairro' | 'cidade' | 'estado';

interface DiscoverResult { found: number; sendable: number; discarded: number; inserted: number; duplicates: number; }
interface JobCreate { jobId: string; totalQueries: number; estCostUsd: number; }
interface JobStatus {
  id: string; status: 'running' | 'done' | 'cancelled' | 'error';
  cursor: number; total_queries: number;
  found: number; inserted: number; sendable: number; discarded: number;
  error_detail: string | null;
}
interface DispatchResult { candidates: number; sent: number; blocked: number; skipped: number; failed: number; dryRun: boolean; capHit: boolean; }

export default function DiscoveryPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('bairro');
  const [uf, setUf] = useState<string | null>('SP');
  const [city, setCity] = useState('São Paulo');
  const [bairro, setBairro] = useState('');
  const [onlySendable, setOnlySendable] = useState(true);
  const [maxQueries, setMaxQueries] = useState(300);
  const [dispatchLimit, setDispatchLimit] = useState(10);
  const [confirmDispatch, setConfirmDispatch] = useState(false);
  const [lastDiscover, setLastDiscover] = useState<DiscoverResult | null>(null);
  const [lastDispatch, setLastDispatch] = useState<DispatchResult | null>(null);
  const [activeJob, setActiveJob] = useState<string | null>(null);

  const jobQ = useQuery({
    queryKey: ['prospect-admin', 'discovery-status', activeJob],
    queryFn: async () => (await api.get<{ data: JobStatus }>(`/prospect-admin?action=discovery-status&job_id=${activeJob}`)).data.data,
    enabled: !!activeJob,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'running' ? 3000 : false;
    },
  });
  const job = jobQ.data;
  const jobFinished = job && job.status !== 'running';
  useEffect(() => {
    // Job finished → refresh the pool once; the summary card stays visible.
    if (jobFinished) qc.invalidateQueries({ queryKey: ['prospect-admin', 'list'] });
  }, [jobFinished, qc]);

  const discover = useMutation({
    mutationFn: async () =>
      (await api.post<{ data: DiscoverResult }>('/prospect-admin?action=discover', {
        city, uf, bairro: bairro || undefined, only_sendable: onlySendable, maxResults: 60,
      })).data.data,
    onSuccess: (data) => {
      setLastDiscover(data);
      toast.success(`${data.found} encontrados · ${data.sendable} com WhatsApp · ${data.inserted} novos`);
      qc.invalidateQueries({ queryKey: ['prospect-admin'] });
    },
    onError: () => toast.error('Busca falhou — confira cidade/UF'),
  });

  const createJob = useMutation({
    mutationFn: async () =>
      (await api.post<{ data: JobCreate }>('/prospect-admin?action=discovery-job', {
        mode, uf, city: mode !== 'estado' ? city : undefined, bairro: undefined,
        only_sendable: onlySendable, max_queries: maxQueries,
      })).data.data,
    onSuccess: (data) => {
      setActiveJob(data.jobId);
      toast.success(`Varredura iniciada: ${data.totalQueries} consultas (~US$ ${data.estCostUsd})`);
    },
    onError: () => toast.error('Não foi possível iniciar a varredura'),
  });

  const cancelJob = useMutation({
    mutationFn: async () => (await api.post('/prospect-admin?action=discovery-cancel', { job_id: activeJob })).data,
    onSuccess: () => toast.info('Varredura cancelada'),
  });

  const dispatch = useMutation({
    mutationFn: async () =>
      (await api.post<{ data: DispatchResult }>('/prospect-admin?action=dispatch', { limit: dispatchLimit })).data.data,
    onSuccess: (data) => {
      setLastDispatch(data);
      setConfirmDispatch(false);
      if (data.dryRun) toast.info(`Dry-run: ${data.candidates} candidatos (nada enviado)`);
      else toast.success(`${data.sent} intros enviadas${data.capHit ? ' — limite diário atingido' : ''}`);
      qc.invalidateQueries({ queryKey: ['prospect-admin'] });
    },
    onError: () => { setConfirmDispatch(false); toast.error('Disparo falhou'); },
  });

  const estQueries = mode === 'estado' ? maxQueries : mode === 'cidade' ? Math.min(maxQueries, 100) : 1;
  const estCost = (estQueries * 0.032).toFixed(2);

  return (
    <GlassPanel className="p-4">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left" aria-expanded={open}>
        <div>
          <h2 className="font-medium">Descobrir & Disparar</h2>
          <p className="text-xs text-stone-500">Varrer bairros, cidades inteiras ou estados no Google Maps — só entra lead com WhatsApp</p>
        </div>
        <span className={`text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Territory mode */}
          <div className="flex gap-1.5">
            {([
              { m: 'bairro' as Mode, label: 'Bairro' },
              { m: 'cidade' as Mode, label: 'Cidade inteira' },
              { m: 'estado' as Mode, label: 'Estado inteiro' },
            ]).map(({ m, label }) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-full text-xs font-medium ${mode === m ? 'bg-burgundy text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* UF selector */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {REGIOES.map((r) => (
              <div key={r.nome}>
                <p className="text-[11px] uppercase tracking-wide text-stone-400 mb-1.5">{r.nome}</p>
                <div className="flex flex-wrap gap-1">
                  {r.ufs.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUf(uf === u ? null : u)}
                      className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${uf === u ? 'bg-burgundy text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Mode-specific inputs */}
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            {mode !== 'estado' && (
              <label className="text-xs text-stone-500">
                Cidade *
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="São Paulo"
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/70"
                />
              </label>
            )}
            {mode === 'bairro' && (
              <label className="text-xs text-stone-500">
                Bairro / zona
                <input
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  placeholder="Jardins, Pinheiros…"
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/70"
                />
              </label>
            )}
            {mode !== 'bairro' && (
              <label className="text-xs text-stone-500">
                Máx. de consultas
                <input
                  type="number" min={10} max={2000}
                  value={maxQueries}
                  onChange={(e) => setMaxQueries(Math.min(2000, Math.max(10, Number(e.target.value) || 300)))}
                  className="mt-1 w-28 rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/70"
                />
              </label>
            )}
            {mode === 'bairro' ? (
              <button
                type="button"
                disabled={discover.isPending || !city.trim()}
                onClick={() => discover.mutate()}
                className="px-4 py-2 rounded-xl bg-burgundy text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {discover.isPending ? 'Buscando…' : 'Buscar (até 60)'}
              </button>
            ) : (
              <button
                type="button"
                disabled={createJob.isPending || (mode === 'cidade' && !city.trim()) || !uf || (job?.status === 'running')}
                onClick={() => createJob.mutate()}
                className="px-4 py-2 rounded-xl bg-burgundy text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                title={`~${estQueries} consultas · ~US$ ${estCost}`}
              >
                {createJob.isPending ? 'Preparando…' : `Iniciar varredura (~US$ ${estCost})`}
              </button>
            )}
          </div>

          <label className="flex items-center gap-1.5 text-xs text-stone-600">
            <input type="checkbox" checked={onlySendable} onChange={(e) => setOnlySendable(e.target.checked)} />
            só guardar leads <span className="font-medium">com WhatsApp (celular)</span> — sem número não tem conversa
          </label>

          {/* Job progress */}
          {job && (
            <div className={`rounded-xl border px-3 py-2 ${job.status === 'running' ? 'border-sky-200 bg-sky-50/60' : job.status === 'done' ? 'border-emerald-200 bg-emerald-50/60' : 'border-stone-200 bg-stone-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-stone-700">
                  {job.status === 'running' ? '🔎 Varredura em andamento' : job.status === 'done' ? '✅ Varredura concluída' : job.status === 'error' ? `⚠ Erro: ${job.error_detail}` : '⏹ Cancelada'}
                  <span className="text-stone-500 font-normal"> · consulta {job.cursor}/{job.total_queries}</span>
                </p>
                {job.status === 'running' && (
                  <button type="button" onClick={() => cancelJob.mutate()} className="text-xs text-rose-700 underline">cancelar</button>
                )}
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-stone-100 overflow-hidden">
                <div
                  className={`h-full transition-all ${job.status === 'done' ? 'bg-emerald-400' : 'bg-sky-400'}`}
                  style={{ width: `${job.total_queries ? Math.round((100 * job.cursor) / job.total_queries) : 0}%` }}
                />
              </div>
              <p className="text-xs text-stone-600 mt-1">
                {job.found} encontrados · <span className="font-medium text-emerald-700">{job.sendable} com WhatsApp</span> · {job.inserted} novos no pool · {job.discarded} descartados (sem celular)
              </p>
            </div>
          )}

          {lastDiscover && !job && (
            <p className="text-xs text-stone-500">
              Última busca: {lastDiscover.found} encontrados · <span className="text-emerald-700 font-medium">{lastDiscover.sendable} com WhatsApp</span> · {lastDiscover.inserted} novos · {lastDiscover.discarded} descartados
            </p>
          )}

          {/* Mass dispatch */}
          <div className="pt-3 border-t border-stone-200/60 flex flex-wrap items-end gap-2">
            <label className="text-xs text-stone-500">
              Enviar até
              <input
                type="number" min={1} max={100}
                value={dispatchLimit}
                onChange={(e) => setDispatchLimit(Math.min(100, Math.max(1, Number(e.target.value) || 10)))}
                className="mt-1 w-20 rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/70"
              />
            </label>
            <span className="text-xs text-stone-400 pb-2.5">intros (respeita o limite diário de aquecimento e opt-outs)</span>
            {!confirmDispatch ? (
              <button
                type="button"
                onClick={() => setConfirmDispatch(true)}
                className="ml-auto px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:opacity-90"
              >
                Disparar intros
              </button>
            ) : (
              <span className="ml-auto flex items-center gap-2">
                <span className="text-xs text-stone-600">
                  Enviar mensagens REAIS para até {dispatchLimit} restaurantes?
                  <span className="text-stone-400"> (~R$ {(dispatchLimit * 0.31).toFixed(2).replace('.', ',')} em conversas de marketing)</span>
                </span>
                <button
                  type="button"
                  disabled={dispatch.isPending}
                  onClick={() => dispatch.mutate()}
                  className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {dispatch.isPending ? 'Enviando…' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDispatch(false)}
                  className="px-3 py-2 rounded-xl bg-stone-100 text-stone-600 text-sm hover:bg-stone-200"
                >
                  Cancelar
                </button>
              </span>
            )}
          </div>

          {lastDispatch && (
            <p className="text-xs text-stone-500">
              Último disparo: {lastDispatch.sent} enviadas · {lastDispatch.skipped} puladas · {lastDispatch.failed} falhas
              {lastDispatch.capHit ? ' · limite diário atingido' : ''}{lastDispatch.dryRun ? ' · DRY-RUN' : ''}
            </p>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
