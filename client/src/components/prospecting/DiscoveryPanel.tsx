import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { GlassPanel } from '../common/glass';
import { useToast } from '../../contexts/ToastContext';

/**
 * Discovery + mass-dispatch panel (Phase 7 ops platform).
 * Pick a region/state on the Brazil selector, narrow by city/bairro, run a
 * Google Places discovery into the lead pool, then fire the cold-intro batch
 * (warm-up daily cap + opt-out suppression enforced server-side).
 */

const REGIOES: Array<{ nome: string; ufs: string[] }> = [
  { nome: 'Norte', ufs: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'] },
  { nome: 'Nordeste', ufs: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'] },
  { nome: 'Centro-Oeste', ufs: ['DF', 'GO', 'MS', 'MT'] },
  { nome: 'Sudeste', ufs: ['ES', 'MG', 'RJ', 'SP'] },
  { nome: 'Sul', ufs: ['PR', 'RS', 'SC'] },
];

interface DiscoverResult { found: number; inserted: number; duplicates: number; }
interface DispatchResult { candidates: number; sent: number; blocked: number; skipped: number; failed: number; dryRun: boolean; capHit: boolean; }

export default function DiscoveryPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [uf, setUf] = useState<string | null>('SP');
  const [city, setCity] = useState('São Paulo');
  const [bairro, setBairro] = useState('');
  const [maxResults, setMaxResults] = useState(20);
  const [dispatchLimit, setDispatchLimit] = useState(10);
  const [confirmDispatch, setConfirmDispatch] = useState(false);
  const [lastDiscover, setLastDiscover] = useState<DiscoverResult | null>(null);
  const [lastDispatch, setLastDispatch] = useState<DispatchResult | null>(null);

  const discover = useMutation({
    mutationFn: async () =>
      (await api.post<{ data: DiscoverResult }>('/prospect-admin?action=discover', {
        city, uf, bairro: bairro || undefined, maxResults,
      })).data.data,
    onSuccess: (data) => {
      setLastDiscover(data);
      toast.success(`${data.found} encontrados, ${data.inserted} novos no pool`);
      qc.invalidateQueries({ queryKey: ['prospect-admin'] });
    },
    onError: () => toast.error('Busca falhou — confira cidade/UF'),
  });

  const dispatch = useMutation({
    mutationFn: async () =>
      (await api.post<{ data: DispatchResult }>('/prospect-admin?action=dispatch', {
        limit: dispatchLimit,
      })).data.data,
    onSuccess: (data) => {
      setLastDispatch(data);
      setConfirmDispatch(false);
      if (data.dryRun) toast.info(`Dry-run: ${data.candidates} candidatos (nada enviado)`);
      else toast.success(`${data.sent} intros enviadas${data.capHit ? ' — limite diário atingido' : ''}`);
      qc.invalidateQueries({ queryKey: ['prospect-admin'] });
    },
    onError: () => { setConfirmDispatch(false); toast.error('Disparo falhou'); },
  });

  return (
    <GlassPanel className="p-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left"
        aria-expanded={open}
      >
        <div>
          <h2 className="font-medium">Descobrir & Disparar</h2>
          <p className="text-xs text-stone-500">Buscar restaurantes por região no Google Maps e enviar o primeiro contato em massa</p>
        </div>
        <span className={`text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Region / state selector */}
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
                      className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                        uf === u ? 'bg-burgundy text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="grid sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
            <label className="text-xs text-stone-500">
              Cidade *
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="São Paulo"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/70"
              />
            </label>
            <label className="text-xs text-stone-500">
              Bairro / zona (opcional)
              <input
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                placeholder="Jardins, Pinheiros…"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/70"
              />
            </label>
            <label className="text-xs text-stone-500">
              Máx.
              <input
                type="number" min={1} max={20}
                value={maxResults}
                onChange={(e) => setMaxResults(Math.min(20, Math.max(1, Number(e.target.value) || 20)))}
                className="mt-1 w-20 rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/70"
              />
            </label>
            <button
              type="button"
              disabled={discover.isPending || !city.trim()}
              onClick={() => discover.mutate()}
              className="px-4 py-2 rounded-xl bg-burgundy text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {discover.isPending ? 'Buscando…' : 'Buscar leads'}
            </button>
          </div>

          {lastDiscover && (
            <p className="text-xs text-stone-500">
              Última busca: {lastDiscover.found} encontrados · {lastDiscover.inserted} novos · {lastDiscover.duplicates} já existiam
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
                <span className="text-xs text-stone-600">Enviar mensagens REAIS para até {dispatchLimit} restaurantes?</span>
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
