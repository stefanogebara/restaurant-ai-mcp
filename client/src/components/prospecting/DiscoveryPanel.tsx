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
  const [territorio, setTerritorio] = useState('');
  const [confirmDispatch, setConfirmDispatch] = useState(false);
  const [lastDiscover, setLastDiscover] = useState<DiscoverResult | null>(null);
  const [lastDispatch, setLastDispatch] = useState<DispatchResult | null>(null);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [sugInput, setSugInput] = useState('');

  // Google Places autocomplete (server-side proxy keeps the key private):
  // suggests bairros/cidades while typing in either location field.
  useEffect(() => {
    const q = sugInput.trim();
    if (q.length < 3) { setSugestoes([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api.get<{ data: Array<{ texto: string }> }>(
          `/prospect-admin?action=places-suggest&input=${encodeURIComponent(q)}`);
        setSugestoes((r.data.data || []).map((x) => x.texto));
      } catch { setSugestoes([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [sugInput]);

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
      toast.success(`${data.found} restaurantes encontrados · ${data.sendable} com telefone · ${data.inserted} novos na lista`);
      qc.invalidateQueries({ queryKey: ['prospect-admin'] });
    },
    onError: () => toast.error('Busca falhou — confira a cidade e o estado'),
  });

  const createJob = useMutation({
    mutationFn: async () =>
      (await api.post<{ data: JobCreate }>('/prospect-admin?action=discovery-job', {
        mode, uf, city: mode !== 'estado' ? city : undefined, bairro: undefined,
        only_sendable: onlySendable, max_queries: maxQueries,
      })).data.data,
    onSuccess: (data) => {
      setActiveJob(data.jobId);
      toast.success(`Varredura iniciada: ${data.totalQueries} buscas no Google Maps (~US$ ${data.estCostUsd}) — roda sozinha em segundo plano`);
    },
    onError: () => toast.error('Não foi possível iniciar a varredura'),
  });

  const cancelJob = useMutation({
    mutationFn: async () => (await api.post('/prospect-admin?action=discovery-cancel', { job_id: activeJob })).data,
    onSuccess: () => toast.info('Varredura cancelada'),
  });

  const dispatch = useMutation({
    mutationFn: async () =>
      (await api.post<{ data: DispatchResult }>('/prospect-admin?action=dispatch', {
        limit: dispatchLimit,
        territorio: territorio.trim() || undefined,
      })).data.data,
    onSuccess: (data) => {
      setLastDispatch(data);
      setConfirmDispatch(false);
      if (data.dryRun) toast.info(`Modo teste — nada é enviado: ${data.candidates} leads entrariam no disparo`);
      else toast.success(`${data.sent} primeiras mensagens enviadas${data.capHit ? ' — limite diário de envios atingido' : ''}`);
      qc.invalidateQueries({ queryKey: ['prospect-admin'] });
    },
    onError: () => { setConfirmDispatch(false); toast.error('Disparo falhou — nenhuma mensagem foi enviada'); },
  });

  const estQueries = mode === 'estado' ? maxQueries : mode === 'cidade' ? Math.min(maxQueries, 100) : 1;
  const estCost = (estQueries * 0.032).toFixed(2);

  return (
    <GlassPanel className="p-4">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left" aria-expanded={open}>
        <div>
          <h2 className="font-medium">Descobrir & Disparar</h2>
          <p className="text-xs text-stone-500">Buscar restaurantes no Google Maps (bairro, cidade ou estado) — todo restaurante com telefone brasileiro entra na lista; o WhatsApp é confirmado no primeiro envio (quem não tem sai sozinho da fila)</p>
        </div>
        <span className={`text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Territory mode */}
          <div className="flex gap-1.5">
            {([
              { m: 'bairro' as Mode, label: 'Bairro', hint: 'Busca rápida: até 60 restaurantes de um bairro, resultado na hora' },
              { m: 'cidade' as Mode, label: 'Cidade inteira', hint: 'Varre bairro por bairro da cidade — roda sozinha em segundo plano' },
              { m: 'estado' as Mode, label: 'Estado inteiro', hint: 'Varre todas as cidades do estado — roda sozinha em segundo plano' },
            ]).map(({ m, label, hint }) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                title={hint}
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
                  onChange={(e) => { setCity(e.target.value); setSugInput(e.target.value); }}
                  placeholder="São Paulo"
                  list="lugares-br"
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/70"
                />
              </label>
            )}
            {mode === 'bairro' && (
              <label className="text-xs text-stone-500">
                Bairro / zona
                <input
                  value={bairro}
                  onChange={(e) => { setBairro(e.target.value); setSugInput(e.target.value); }}
                  placeholder="Jardins, Pinheiros…"
                  list="lugares-br"
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/70"
                />
              </label>
            )}
            {mode !== 'bairro' && (
              <label className="text-xs text-stone-500" title="Cada busca no Google Maps custa ~US$ 0,03. Este número é o teto de gasto da varredura.">
                Máx. de buscas no Google
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
                {discover.isPending ? 'Buscando…' : 'Buscar (até 60 restaurantes)'}
              </button>
            ) : (
              <button
                type="button"
                disabled={createJob.isPending || (mode === 'cidade' && !city.trim()) || !uf || (job?.status === 'running')}
                onClick={() => createJob.mutate()}
                className="px-4 py-2 rounded-xl bg-burgundy text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                title={`Faz ~${estQueries} buscas no Google Maps (~US$ ${estCost}). Roda sozinha em segundo plano — você pode fechar esta tela.`}
              >
                {createJob.isPending ? 'Preparando…' : `Iniciar varredura (~US$ ${estCost})`}
              </button>
            )}
          </div>

          <datalist id="lugares-br">
            {sugestoes.map((sug) => <option key={sug} value={sug} />)}
          </datalist>

          <label className="flex items-center gap-1.5 text-xs text-stone-600">
            <input type="checkbox" checked={onlySendable} onChange={(e) => setOnlySendable(e.target.checked)} />
            só guardar leads <span className="font-medium">com telefone brasileiro (fixo ou celular)</span> — fixo também costuma ter WhatsApp Business; quem não tiver sai sozinho da fila no primeiro envio
          </label>

          {/* Job progress */}
          {job && (
            <div className={`rounded-xl border px-3 py-2 ${job.status === 'running' ? 'border-sky-200 bg-sky-50/60' : job.status === 'done' ? 'border-emerald-200 bg-emerald-50/60' : 'border-stone-200 bg-stone-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-stone-700">
                  {job.status === 'running' ? '🔎 Varredura em andamento — roda sozinha, pode fechar esta tela' : job.status === 'done' ? '✅ Varredura concluída' : job.status === 'error' ? `⚠ Erro: ${job.error_detail}` : '⏹ Cancelada'}
                  <span className="text-stone-500 font-normal"> · busca {job.cursor} de {job.total_queries}</span>
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
                {job.found} restaurantes encontrados · <span className="font-medium text-emerald-700">{job.sendable} com telefone</span> · {job.inserted} novos na lista · {job.discarded} sem telefone (descartados)
              </p>
            </div>
          )}

          {lastDiscover && !job && (
            <p className="text-xs text-stone-500">
              Última busca: {lastDiscover.found} restaurantes encontrados · <span className="text-emerald-700 font-medium">{lastDiscover.sendable} com telefone</span> · {lastDiscover.inserted} novos na lista · {lastDiscover.discarded} sem telefone (descartados)
            </p>
          )}

          {/* Mass dispatch */}
          <div className="pt-3 border-t border-stone-200/60 flex flex-wrap items-end gap-2">
            <label className="text-xs text-stone-500">
              Enviar até
              <input
                type="number" min={1} max={250}
                value={dispatchLimit}
                onChange={(e) => setDispatchLimit(Math.min(250, Math.max(1, Number(e.target.value) || 10)))}
                className="mt-1 w-20 rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/70"
              />
            </label>
            <label className="text-xs text-stone-500">
              Só para a região (opcional)
              <input
                value={territorio}
                onChange={(e) => setTerritorio(e.target.value)}
                placeholder="Pinheiros, Moema, SP…"
                list="lugares-br"
                title="Filtra o disparo por bairro, cidade ou UF — compara com a cidade e o endereço do lead"
                className="mt-1 w-44 rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/70"
              />
            </label>
            <span className="text-xs text-stone-400 pb-2.5">o disparo envia a primeira mensagem para leads nunca contatados; respeita o limite diário do número (que cresce sozinho até 250/dia) e quem pediu pra sair</span>
            {!confirmDispatch ? (
              <button
                type="button"
                onClick={() => setConfirmDispatch(true)}
                title="Envia a primeira mensagem (modelo aprovado pela Meta) para leads da lista que ainda não foram contatados"
                className="ml-auto px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:opacity-90"
              >
                Disparar primeiras mensagens
              </button>
            ) : (
              <span className="ml-auto flex items-center gap-2">
                <span className="text-xs text-stone-600">
                  Enviar mensagens REAIS para até {dispatchLimit} restaurantes?
                  <span className="text-stone-400"> (custo estimado de WhatsApp: ~R$ {(dispatchLimit * 0.31).toFixed(2).replace('.', ',')})</span>
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
              Último disparo: {lastDispatch.sent} mensagens enviadas · {lastDispatch.skipped} leads pulados · {lastDispatch.failed} falharam
              {lastDispatch.capHit ? ' · limite diário de envios atingido' : ''}{lastDispatch.dryRun ? ' · modo teste — nada foi enviado' : ''}
            </p>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
