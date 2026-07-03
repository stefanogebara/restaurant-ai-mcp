import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { GlassCard, GlassPanel } from '../components/common/glass';
import { useToast } from '../contexts/ToastContext';
import DiscoveryPanel from '../components/prospecting/DiscoveryPanel';
import VariantsPanel from '../components/prospecting/VariantsPanel';
import InsightsPanel from '../components/prospecting/InsightsPanel';
import GymPanel from '../components/prospecting/GymPanel';
import LeadList, { Badge, orderForTab } from '../components/prospecting/LeadList';
import ThreadView from '../components/prospecting/ThreadView';
import { HealthInline, DispatchPausedBanner } from '../components/prospecting/HealthCard';
import type { ProspectLead, Overview } from '../components/prospecting/types';
import { fmtTime, httpStatus } from '../components/prospecting/types';

/**
 * Olímpia Ops — the STANDALONE prospecting console (Phase 7 + 8), deliberately
 * outside the restaurant product. Access: Google login + PROSPECTING_ADMIN_EMAILS
 * allowlist enforced server-side (403 → restricted screen).
 *
 * Layout: header (health + kill switch) → breaker banner → status strip →
 * meetings → Descobrir & Disparar → Abordagens (A/B) → Insights → Triagem/Todos
 * work queue with the thread workbench.
 */

interface ListData { leads: ProspectLead[]; counts: Record<string, number>; agent_enabled: boolean; dry_run: boolean; }

function Stat({ label, value, caption, tone }: { label: string; value: string | number; caption?: string; tone?: 'good' | 'warn' }) {
  const toneClass = tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-stone-800';
  return (
    <div className="px-4 py-2">
      <p className="text-[11px] uppercase tracking-wide text-stone-400">{label}</p>
      <p className={`text-lg font-semibold ${toneClass}`}>{value}</p>
      {caption && <p className="text-[10px] text-stone-500">{caption}</p>}
    </div>
  );
}

function replyCaption(sent: number, replied: number): string | undefined {
  if (!sent) return undefined;
  const rate = Math.round((1000 * replied) / sent) / 10;
  if (rate >= 4) return `${rate}% — acima do baseline genérico (2%)`;
  if (rate >= 2) return `${rate}% — no baseline genérico`;
  return `${rate}%`;
}

export default function OlimpiaOps() {
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'triagem' | 'todos'>('triagem');
  const [bucketFilter, setBucketFilter] = useState<string | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const overviewQ = useQuery({
    queryKey: ['prospect-admin', 'overview'],
    queryFn: async () => (await api.get<{ data: Overview }>('/prospect-admin?action=overview')).data.data,
    refetchInterval: 30000,
    retry: (count, err) => httpStatus(err) !== 403 && count < 2,
  });

  const listQ = useQuery({
    queryKey: ['prospect-admin', 'list'],
    queryFn: async () => (await api.get<{ data: ListData }>('/prospect-admin?action=list')).data.data,
    refetchInterval: 20000,
    retry: (count, err) => httpStatus(err) !== 403 && count < 2,
  });

  const agentToggle = useMutation({
    mutationFn: async (enabled: boolean) => (await api.post('/prospect-admin?action=agent', { enabled })).data,
    onSuccess: (_d, enabled) => {
      setConfirmStop(false);
      toast.success(enabled ? 'Agente REATIVADO' : 'Agente PARADO — nada mais sai');
      qc.invalidateQueries({ queryKey: ['prospect-admin'] });
    },
    onError: () => { setConfirmStop(false); toast.error('Não foi possível alterar o agente'); },
  });

  // Server-side allowlist says no → restricted screen, no internals leaked.
  if (httpStatus(listQ.error) === 403 || httpStatus(overviewQ.error) === 403) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <GlassCard className="p-8 max-w-md text-center space-y-3">
          <h1 className="text-xl font-serif">Olímpia — Ops</h1>
          <p className="text-sm text-stone-600">
            Console restrito ao administrador de prospecção. Sua conta Google não está na lista de acesso.
          </p>
          <Link to="/host-dashboard/simple" className="inline-block text-sm text-burgundy underline">Voltar ao painel</Link>
        </GlassCard>
      </div>
    );
  }

  const ov = overviewQ.data;
  const leads = listQ.data?.leads ?? [];
  const counts = listQ.data?.counts ?? {};
  const agentEnabled = ov?.agent_enabled ?? listQ.data?.agent_enabled ?? true;
  const dryRun = ov?.dry_run ?? listQ.data?.dry_run ?? true;
  const triagemCount = orderForTab(leads, 'triagem', null, nowMs).length;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/60 border-b border-stone-200/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-lg">Olímpia <span className="text-stone-400">·</span> Ops</h1>
            {dryRun && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">DRY-RUN</span>}
            {ov && <HealthInline ov={ov} />}
          </div>
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1.5 text-sm font-medium ${agentEnabled ? 'text-emerald-700' : 'text-rose-700'}`}>
              <span className={`w-2 h-2 rounded-full ${agentEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              {agentEnabled ? 'Agente ativo' : 'Agente PARADO'}
            </span>
            {agentEnabled ? (
              !confirmStop ? (
                <button type="button" onClick={() => setConfirmStop(true)} className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-sm font-medium hover:opacity-90">
                  Parar agente
                </button>
              ) : (
                <span className="flex items-center gap-1.5">
                  <button type="button" disabled={agentToggle.isPending} onClick={() => agentToggle.mutate(false)} className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
                    Confirmar parada
                  </button>
                  <button type="button" onClick={() => setConfirmStop(false)} className="px-2.5 py-1.5 rounded-xl bg-stone-100 text-stone-600 text-sm hover:bg-stone-200">✕</button>
                </span>
              )
            ) : (
              <button type="button" disabled={agentToggle.isPending} onClick={() => agentToggle.mutate(true)} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
                Reativar agente
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-5">
        {ov && <DispatchPausedBanner ov={ov} />}

        <GlassPanel className="p-2 flex flex-wrap divide-x divide-stone-200/60">
          <Stat label="Enviadas hoje" value={ov ? ov.sent_today : '—'} />
          <Stat label="Limite diário" value={ov ? ov.daily_cap : '—'} tone={ov && ov.sent_today >= ov.daily_cap ? 'warn' : undefined} />
          <Stat
            label="Recebidas hoje"
            value={ov ? ov.received_today : '—'}
            tone={ov && ov.received_today > 0 ? 'good' : undefined}
            caption={ov ? replyCaption(ov.sent_today, ov.received_today) : undefined}
          />
          <Stat label="Follow-ups na fila" value={ov ? ov.due_followups : '—'} />
          <Stat label="Reuniões marcadas" value={ov ? ov.meetings.length : '—'} tone={ov && ov.meetings.length > 0 ? 'good' : undefined} />
          <Stat label="Conversas 30d" value={ov?.outcomes?.total ?? 0} />
          <Stat label="Qualidade média" value={ov?.outcomes?.media_qualidade ?? '—'} />
        </GlassPanel>

        {ov && ov.meetings.length > 0 && (
          <GlassPanel className="p-4">
            <h2 className="font-medium mb-2">Próximas reuniões</h2>
            <ul className="space-y-1">
              {ov.meetings.map((m) => (
                <li key={m.id} className="text-sm text-stone-700 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.name}</span>
                  <span className="text-stone-400">{m.city ?? ''}</span>
                  <span>{fmtTime(m.reuniao_at)}</span>
                  {m.reuniao_link && (
                    <>
                      <a href={m.reuniao_link} target="_blank" rel="noreferrer" className="text-burgundy underline text-xs">Meet</a>
                      <button
                        type="button"
                        className="text-xs text-stone-400 hover:text-stone-600"
                        title="Copiar link"
                        onClick={() => { navigator.clipboard.writeText(m.reuniao_link!); toast.success('Link copiado'); }}
                      >
                        ⧉
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </GlassPanel>
        )}

        <DiscoveryPanel />
        <VariantsPanel />
        <InsightsPanel />
        <GymPanel />

        {/* Work queue: Triagem (default) | Todos with funnel filters */}
        <GlassPanel className="p-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('triagem')}
            className={`px-3 py-1 rounded-full text-sm font-medium ${tab === 'triagem' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
          >
            Triagem {triagemCount > 0 && <span className="ml-1">{triagemCount}</span>}
          </button>
          <button
            type="button"
            onClick={() => setTab('todos')}
            className={`px-3 py-1 rounded-full text-sm font-medium ${tab === 'todos' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
          >
            Todos {leads.length}
          </button>
          {tab === 'todos' && (
            <span className="flex flex-wrap gap-1.5 ml-2">
              {Object.entries(counts).filter(([, n]) => n > 0).map(([b, n]) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBucketFilter(bucketFilter === b ? null : b)}
                  className={`flex items-center gap-1 px-1 py-0.5 rounded-full transition-opacity ${bucketFilter && bucketFilter !== b ? 'opacity-40' : ''}`}
                >
                  <Badge bucket={b} /> <span className="text-xs text-stone-600">{n}</span>
                </button>
              ))}
            </span>
          )}
          <span className="ml-auto text-[11px] text-stone-400">j/k navegam · atualiza 20s</span>
        </GlassPanel>

        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5">
          <LeadList
            leads={leads}
            tab={tab}
            bucketFilter={bucketFilter}
            selected={selected}
            onSelect={setSelected}
            loading={listQ.isLoading}
            nowMs={nowMs}
          />
          <GlassCard className="p-4 flex flex-col max-h-[70vh]">
            {!selected && <p className="text-sm text-stone-500 m-auto">Selecione um lead para ver a conversa.</p>}
            {selected && <ThreadView leadId={selected} nowMs={nowMs} />}
          </GlassCard>
        </div>
      </main>
    </div>
  );
}
