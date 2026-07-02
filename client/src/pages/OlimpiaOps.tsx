import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { GlassCard, GlassPanel } from '../components/common/glass';
import { useToast } from '../contexts/ToastContext';
import DiscoveryPanel from '../components/prospecting/DiscoveryPanel';

/**
 * Olímpia Ops — the STANDALONE prospecting console (Phase 7), deliberately
 * outside the restaurant product (no DashboardLayout, no tenant nav). Access:
 * Google login + the PROSPECTING_ADMIN_EMAILS allowlist enforced server-side
 * (403 → restricted screen). Everything e2e: live overview, discovery + mass
 * dispatch, funnel, every WhatsApp conversation, human takeover, global stop.
 */

interface ProspectLead {
  id: string; name: string; sector: string | null; city: string | null;
  whatsapp_phone: string | null; prospect_state: string; bucket: string;
  lead_score: number | null; owner_name: string | null;
  reuniao_at: string | null; reuniao_link: string | null; updated_at: string;
}
interface ProspectMessage { direcao: 'in' | 'out'; corpo: string | null; tipo: string | null; enviada_em: string; }
interface ListData { leads: ProspectLead[]; counts: Record<string, number>; agent_enabled: boolean; dry_run: boolean; }
interface DetailData { lead: ProspectLead; messages: ProspectMessage[]; bucket: string; can_free_text: boolean; }
interface Overview {
  agent_enabled: boolean; dry_run: boolean; daily_cap: number;
  sent_today: number; received_today: number;
  meetings: Array<{ id: string; name: string; city: string | null; reuniao_at: string; reuniao_link: string | null }>;
  outcomes: { total?: number; por_outcome?: Record<string, number>; media_qualidade?: number | null } | null;
}
type ProspectAction = 'pause' | 'reactivate' | 'optout';

const BUCKET_LABEL: Record<string, string> = {
  pending: 'Aguardando', sent: 'Enviado', seen: 'Visto', replied: 'Respondeu',
  scheduling: 'Agendando', booked: 'Agendado', handoff: 'Humano', optout: 'Opt-out', failed: 'Falhou',
};
const BUCKET_CLASS: Record<string, string> = {
  booked: 'bg-emerald-100 text-emerald-800', replied: 'bg-emerald-100 text-emerald-800',
  scheduling: 'bg-sky-100 text-sky-800', seen: 'bg-sky-100 text-sky-800',
  sent: 'bg-stone-100 text-stone-700', pending: 'bg-stone-100 text-stone-600',
  handoff: 'bg-amber-100 text-amber-800', optout: 'bg-rose-100 text-rose-800', failed: 'bg-rose-100 text-rose-800',
};

function Badge({ bucket }: { bucket: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${BUCKET_CLASS[bucket] ?? 'bg-stone-100 text-stone-600'}`}>
      {BUCKET_LABEL[bucket] ?? bucket}
    </span>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function httpStatus(err: unknown): number | null {
  return (err as { response?: { status?: number } })?.response?.status ?? null;
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'good' | 'warn' | 'bad' }) {
  const toneClass = tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : tone === 'bad' ? 'text-rose-700' : 'text-stone-800';
  return (
    <div className="px-4 py-2">
      <p className="text-[11px] uppercase tracking-wide text-stone-400">{label}</p>
      <p className={`text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

export default function OlimpiaOps() {
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [bucketFilter, setBucketFilter] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [keepActive, setKeepActive] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

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

  const detailQ = useQuery({
    queryKey: ['prospect-admin', 'lead', selected],
    queryFn: async () => (await api.get<{ data: DetailData }>(`/prospect-admin?action=lead&lead_id=${selected}`)).data.data,
    enabled: !!selected,
    refetchInterval: 10000,
  });

  const act = useMutation({
    mutationFn: async ({ action, leadId }: { action: ProspectAction; leadId: string }) =>
      (await api.post(`/prospect-admin?action=${action}`, { lead_id: leadId })).data,
    onSuccess: (_data, vars) => {
      const verb = vars.action === 'pause' ? 'pausado' : vars.action === 'reactivate' ? 'reativado' : 'removido (opt-out)';
      toast.success(`Lead ${verb}`);
      qc.invalidateQueries({ queryKey: ['prospect-admin'] });
    },
    onError: () => toast.error('Não foi possível executar a ação'),
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

  const send = useMutation({
    mutationFn: async ({ leadId, texto }: { leadId: string; texto: string }) =>
      (await api.post('/prospect-admin?action=send', { lead_id: leadId, texto, keep_active: keepActive })).data,
    onSuccess: () => {
      setDraft('');
      toast.success(keepActive ? 'Enviada (Olímpia segue ativa)' : 'Enviada — Olímpia pausada neste lead');
      qc.invalidateQueries({ queryKey: ['prospect-admin'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Envio falhou');
    },
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
  const detail = detailQ.data;
  const shown = bucketFilter ? leads.filter((l) => l.bucket === bucketFilter) : leads;

  return (
    <div className="min-h-screen">
      {/* Own shell — this console is not part of the restaurant product. */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/60 border-b border-stone-200/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-lg">Olímpia <span className="text-stone-400">·</span> Ops</h1>
            {dryRun && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">DRY-RUN</span>}
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
        {/* What's going on — live status strip */}
        <GlassPanel className="p-2 flex flex-wrap divide-x divide-stone-200/60">
          <Stat label="Enviadas hoje" value={ov ? ov.sent_today : '—'} />
          <Stat label="Limite diário" value={ov ? ov.daily_cap : '—'} tone={ov && ov.sent_today >= ov.daily_cap ? 'warn' : undefined} />
          <Stat label="Recebidas hoje" value={ov ? ov.received_today : '—'} tone={ov && ov.received_today > 0 ? 'good' : undefined} />
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
                  {m.reuniao_link && <a href={m.reuniao_link} target="_blank" rel="noreferrer" className="text-burgundy underline text-xs">Meet</a>}
                </li>
              ))}
            </ul>
          </GlassPanel>
        )}

        <DiscoveryPanel />

        {/* Funnel — clickable filters */}
        <GlassPanel className="p-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setBucketFilter(null)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${bucketFilter === null ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
          >
            Todos {leads.length}
          </button>
          {Object.entries(counts).filter(([, n]) => n > 0).map(([b, n]) => (
            <button
              key={b}
              type="button"
              onClick={() => setBucketFilter(bucketFilter === b ? null : b)}
              className={`flex items-center gap-1.5 px-1 py-0.5 rounded-full transition-opacity ${bucketFilter && bucketFilter !== b ? 'opacity-40' : ''}`}
            >
              <Badge bucket={b} /> <span className="text-sm text-stone-600">{n}</span>
            </button>
          ))}
          {Object.values(counts).every((n) => !n) && <span className="text-sm text-stone-500">Nenhum lead ainda — use “Descobrir & Disparar”.</span>}
        </GlassPanel>

        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5">
          <GlassCard className="p-3 max-h-[70vh] overflow-y-auto">
            {listQ.isLoading && <p className="p-3 text-sm text-stone-500">Carregando…</p>}
            {shown.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelected(l.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${selected === l.id ? 'bg-amber-50' : 'hover:bg-stone-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{l.name}</span>
                  <Badge bucket={l.bucket} />
                </div>
                <div className="text-xs text-stone-500 truncate">
                  {[l.city, l.sector, l.whatsapp_phone].filter(Boolean).join(' · ')}
                </div>
              </button>
            ))}
            {!listQ.isLoading && shown.length === 0 && <p className="p-3 text-sm text-stone-500">Nenhum lead{bucketFilter ? ' neste estágio' : ''}.</p>}
          </GlassCard>

          <GlassCard className="p-4 flex flex-col max-h-[70vh]">
            {!selected && <p className="text-sm text-stone-500 m-auto">Selecione um lead para ver a conversa.</p>}
            {selected && detailQ.isLoading && <p className="text-sm text-stone-500">Carregando conversa…</p>}
            {selected && detail && (
              <>
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-stone-200/60">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-medium">{detail.lead.name}</h2>
                      <Badge bucket={detail.bucket} />
                      {detail.lead.prospect_state === 'pausada' && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs">agente pausado</span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500">
                      {[detail.lead.owner_name, detail.lead.whatsapp_phone].filter(Boolean).join(' · ')}
                      {detail.lead.reuniao_at ? ` · reunião ${fmtTime(detail.lead.reuniao_at)}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button type="button" disabled={act.isPending} onClick={() => act.mutate({ action: 'pause', leadId: detail.lead.id })} className="px-2.5 py-1 text-xs rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50">Pausar</button>
                    <button type="button" disabled={act.isPending} onClick={() => act.mutate({ action: 'reactivate', leadId: detail.lead.id })} className="px-2.5 py-1 text-xs rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200 disabled:opacity-50">Reativar</button>
                    <button type="button" disabled={act.isPending} onClick={() => act.mutate({ action: 'optout', leadId: detail.lead.id })} className="px-2.5 py-1 text-xs rounded-lg bg-rose-100 text-rose-800 hover:bg-rose-200 disabled:opacity-50">Opt-out</button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto py-3 space-y-2">
                  {detail.messages.length === 0 && <p className="text-sm text-stone-500">Sem mensagens.</p>}
                  {detail.messages.map((m, i) => (
                    <div key={i} className={`flex ${m.direcao === 'out' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${m.direcao === 'out' ? 'bg-emerald-50 text-stone-800' : 'bg-stone-100 text-stone-800'}`}>
                        <p className="whitespace-pre-wrap break-words">{m.corpo ?? `[${m.tipo}]`}</p>
                        <p className="text-[10px] text-stone-400 mt-0.5 text-right">{fmtTime(m.enviada_em)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Operator composer — human takeover */}
                <div className="pt-3 border-t border-stone-200/60 space-y-1.5">
                  {!detail.can_free_text && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1">
                      Fora da janela de 24h do WhatsApp — texto livre será rejeitado pela Meta.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={2}
                      placeholder={`Responder como ${detail.lead.prospect_state === 'pausada' ? 'você' : 'você (pausa a Olímpia neste lead)'}…`}
                      className="flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm bg-white/70 resize-none"
                    />
                    <button
                      type="button"
                      disabled={send.isPending || !draft.trim() || !detail.can_free_text}
                      onClick={() => send.mutate({ leadId: detail.lead.id, texto: draft.trim() })}
                      className="px-4 rounded-xl bg-burgundy text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 self-stretch"
                    >
                      {send.isPending ? '…' : 'Enviar'}
                    </button>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-stone-500">
                    <input type="checkbox" checked={keepActive} onChange={(e) => setKeepActive(e.target.checked)} />
                    manter a Olímpia ativa neste lead depois do meu envio
                  </label>
                </div>
              </>
            )}
          </GlassCard>
        </div>
      </main>
    </div>
  );
}
