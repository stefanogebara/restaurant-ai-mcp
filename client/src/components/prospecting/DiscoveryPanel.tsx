import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { GlassPanel } from '../common/glass';
import { useToast } from '../../contexts/ToastContext';

/**
 * Descobrir & Disparar — two explicit steps, no accordions:
 *   1 · Buscar restaurantes (Google Maps: bairro rápido, cidade ou estado em job)
 *   2 · Disparar as primeiras mensagens (template aprovado, com confirmação)
 *
 * "Só com telefone" (default ON) discards leads whose Google phone is not a
 * normalizable BR number — if we can't message them, they don't enter the pool.
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

function StepHeader({ n, title, subtitle }: { n: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-7 h-7 rounded-full bg-burgundy/10 text-burgundy text-sm font-semibold flex items-center justify-center shrink-0">{n}</span>
      <div>
        <h2 className="font-medium leading-tight">{title}</h2>
        <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function FunnelLine({ label, r }: { label: string; r: { found: number; sendable: number; inserted: number; discarded: number } }) {
  return (
    <div className="rounded-xl border border-stone-200/70 bg-white/50 px-3 py-2 text-xs text-stone-600">
      {label}: {r.found} restaurantes encontrados · <span className="text-emerald-700 font-medium">{r.sendable} com telefone</span> · <span className="text-sky-700 font-medium">{r.inserted} novos na lista</span> · {r.discarded} sem telefone (descartados)
    </div>
  );
}

export default function DiscoveryPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('bairro');
  const [uf, setUf] = useState<string>('SP');
  const [city, setCity] = useState('São Paulo');
  const [bairro, setBairro] = useState('');
  const [onlySendable, setOnlySendable] = useState(true);
  const [maxQueries, setMaxQueries] = useState(300);
  const [dispatchLimit, setDispatchLimit] = useState(10);
  const [limitTouched, setLimitTouched] = useState(false);
  const [territorio, setTerritorio] = useState('');
  const [confirmDispatch, setConfirmDispatch] = useState(false);
  const [lastDiscover, setLastDiscover] = useState<DiscoverResult | null>(null);
  const [lastDispatch, setLastDispatch] = useState<DispatchResult | null>(null);
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [sugInput, setSugInput] = useState('');

  // Google Places autocomplete (server-side proxy keeps the key private):
  // suggests bairros/cidades while typing in any location field.
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

  // Day budget (shared cache with the cockpit's overview): prefill "Enviar até"
  // with today's remaining allowance instead of a token 10 — the ramp/cap in
  // the backend is the real guard, the field just shouldn't undersell it.
  const overviewQ = useQuery({
    queryKey: ['prospect-admin', 'overview'],
    queryFn: async () =>
      (await api.get<{ data: { daily_cap: number; sent_today: number } }>('/prospect-admin?action=overview')).data.data,
    refetchInterval: 30000,
  });
  const saldoHoje = overviewQ.data
    ? Math.max(0, (overviewQ.data.daily_cap ?? 0) - (overviewQ.data.sent_today ?? 0))
    : null;
  useEffect(() => {
    if (!limitTouched && saldoHoje != null) {
      setDispatchLimit(Math.max(1, Math.min(saldoHoje, 250)));
    }
  }, [saldoHoje, limitTouched]);

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

  // One-click bridge from step 1 → step 2: scope the dispatch to what was just
  // found and open the (single) confirmation. The backend still enforces the
  // daily ramp and skips anyone already contacted or opted out.
  const dispararEncontrados = (encontrados: number, regiao: string) => {
    setTerritorio(regiao);
    setDispatchLimit(Math.max(1, Math.min(encontrados, saldoHoje ?? 250, 250)));
    setLimitTouched(true);
    setConfirmDispatch(true);
  };
  const inputClass = 'mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/70';

  return (
    <div className="space-y-4">
      {/* ─── Passo 1: buscar ─────────────────────────────────────────── */}
      <GlassPanel className="p-4 space-y-4">
        <StepHeader
          n="1"
          title="Buscar restaurantes"
          subtitle="Encontre restaurantes no Google Maps e traga para a lista da Olímpia. Comece por um bairro; cidade e estado inteiros rodam sozinhos em segundo plano."
        />

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

        <div className="grid sm:grid-cols-[7rem_1fr_1fr_auto] gap-2 items-end">
          <label className="text-xs text-stone-500">
            Estado (UF)
            <select value={uf} onChange={(e) => setUf(e.target.value)} className={inputClass}>
              {REGIOES.map((r) => (
                <optgroup key={r.nome} label={r.nome}>
                  {r.ufs.map((u) => <option key={u} value={u}>{u}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          {mode !== 'estado' && (
            <label className="text-xs text-stone-500">
              Cidade *
              <input
                value={city}
                onChange={(e) => { setCity(e.target.value); setSugInput(e.target.value); }}
                placeholder="São Paulo"
                list="lugares-br"
                className={inputClass}
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
                className={inputClass}
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
                className={inputClass}
              />
            </label>
          )}
          {mode === 'bairro' ? (
            <button
              type="button"
              disabled={discover.isPending || !city.trim()}
              onClick={() => discover.mutate()}
              className="px-4 py-2 rounded-xl bg-burgundy text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
            >
              {discover.isPending ? 'Buscando…' : 'Buscar (até 60 restaurantes)'}
            </button>
          ) : (
            <button
              type="button"
              disabled={createJob.isPending || (mode === 'cidade' && !city.trim()) || (job?.status === 'running')}
              onClick={() => createJob.mutate()}
              className="px-4 py-2 rounded-xl bg-burgundy text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
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
          só guardar restaurantes <span className="font-medium">com telefone brasileiro</span> — fixo também costuma ter WhatsApp Business; quem não tiver sai sozinho da fila no primeiro envio
        </label>

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
          <div className="space-y-2">
            <FunnelLine label="Última busca" r={lastDiscover} />
            {lastDiscover.sendable > 0 && (
              <button
                type="button"
                onClick={() => dispararEncontrados(lastDiscover.sendable, (bairro.trim() || city.trim()))}
                className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50/70 text-emerald-800 text-sm font-medium hover:bg-emerald-100 text-left"
              >
                ⚡ Disparar agora para os {Math.max(1, Math.min(lastDiscover.sendable, saldoHoje ?? 250))} com telefone de {bairro.trim() || city.trim()} — 1 clique, confirmação abaixo
              </button>
            )}
          </div>
        )}
        {jobFinished && job && job.sendable > 0 && (
          <button
            type="button"
            onClick={() => dispararEncontrados(job.sendable, mode === 'estado' ? uf : city.trim())}
            className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50/70 text-emerald-800 text-sm font-medium hover:bg-emerald-100 text-left"
          >
            ⚡ Disparar agora para os encontrados na varredura ({Math.max(1, Math.min(job.sendable, saldoHoje ?? 250))} hoje) — confirmação abaixo
          </button>
        )}
      </GlassPanel>

      {/* ─── Passo 2: disparar ───────────────────────────────────────── */}
      <GlassPanel className="p-4 space-y-4">
        <StepHeader
          n="2"
          title="Disparar as primeiras mensagens"
          subtitle="Envia a apresentação da Olímpia (modelo aprovado pela Meta) para restaurantes da lista que nunca foram contatados. Respeita o limite diário do número — que cresce sozinho até 250/dia — e quem pediu para sair."
        />

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-stone-500">
            Enviar até
            <input
              type="number" min={1} max={250}
              value={dispatchLimit}
              onChange={(e) => { setLimitTouched(true); setDispatchLimit(Math.min(250, Math.max(1, Number(e.target.value) || 10))); }}
              className="mt-1 w-20 rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/70"
            />
            {overviewQ.data && (
              <span className={`block mt-1 text-[11px] ${saldoHoje === 0 ? 'text-amber-600 font-medium' : 'text-stone-400'}`}>
                hoje: {overviewQ.data.sent_today}/{overviewQ.data.daily_cap} enviados{saldoHoje === 0 ? ' — limite diário esgotado' : ` · saldo ${saldoHoje}`}
              </span>
            )}
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
          <div className="rounded-xl border border-stone-200/70 bg-white/50 px-3 py-2 text-xs text-stone-600">
            Último disparo: {lastDispatch.sent} mensagens enviadas · {lastDispatch.skipped} leads pulados · {lastDispatch.failed} falharam
            {lastDispatch.capHit ? ' · limite diário de envios atingido' : ''}{lastDispatch.dryRun ? ' · modo teste — nada foi enviado' : ''}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
