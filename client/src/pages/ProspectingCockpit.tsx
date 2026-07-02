import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { GlassCard, GlassPanel } from '../components/common/glass';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useToast } from '../contexts/ToastContext';
import DiscoveryPanel from '../components/prospecting/DiscoveryPanel';

/**
 * Prospecting ops platform (Phase 7) — discover + mass-dispatch leads by
 * region, watch the funnel and every WhatsApp conversation, take over a chat
 * (manual send auto-pauses the agent for that lead), and stop the agent
 * globally. Reads /api/prospect-admin (founder JWT + admin allowlist).
 */

interface ProspectLead {
  id: string;
  name: string;
  sector: string | null;
  city: string | null;
  whatsapp_phone: string | null;
  prospect_state: string;
  bucket: string;
  lead_score: number | null;
  owner_name: string | null;
  reuniao_at: string | null;
  reuniao_link: string | null;
  updated_at: string;
}
interface ProspectMessage {
  direcao: 'in' | 'out';
  corpo: string | null;
  tipo: string | null;
  enviada_em: string;
}
interface ListData {
  leads: ProspectLead[];
  counts: Record<string, number>;
  agent_enabled: boolean;
  dry_run: boolean;
}
interface DetailData { lead: ProspectLead; messages: ProspectMessage[]; bucket: string; can_free_text: boolean; }
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

export default function ProspectingCockpit() {
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [bucketFilter, setBucketFilter] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [keepActive, setKeepActive] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  const listQ = useQuery({
    queryKey: ['prospect-admin', 'list'],
    queryFn: async () => (await api.get<{ data: ListData }>('/prospect-admin?action=list')).data.data,
    refetchInterval: 30000,
  });

  const detailQ = useQuery({
    queryKey: ['prospect-admin', 'lead', selected],
    queryFn: async () => (await api.get<{ data: DetailData }>(`/prospect-admin?action=lead&lead_id=${selected}`)).data.data,
    enabled: !!selected,
    refetchInterval: 15000,
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
    mutationFn: async (enabled: boolean) =>
      (await api.post('/prospect-admin?action=agent', { enabled })).data,
    onSuccess: (_d, enabled) => {
      setConfirmStop(false);
      toast.success(enabled ? 'Agente REATIVADO — Olímpia volta a responder' : 'Agente PARADO — nenhuma mensagem sai');
      qc.invalidateQueries({ queryKey: ['prospect-admin'] });
    },
    onError: () => { setConfirmStop(false); toast.error('Não foi possível alterar o agente'); },
  });

  const send = useMutation({
    mutationFn: async ({ leadId, texto }: { leadId: string; texto: string }) =>
      (await api.post('/prospect-admin?action=send', { lead_id: leadId, texto, keep_active: keepActive })).data,
    onSuccess: () => {
      setDraft('');
      toast.success(keepActive ? 'Enviada (agente segue ativo)' : 'Enviada — agente pausado neste lead');
      qc.invalidateQueries({ queryKey: ['prospect-admin'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Envio falhou');
    },
  });

  const leads = listQ.data?.leads ?? [];
  const counts = listQ.data?.counts ?? {};
  const agentEnabled = listQ.data?.agent_enabled ?? true;
  const dryRun = listQ.data?.dry_run ?? true;
  const detail = detailQ.data;
  const shown = bucketFilter ? leads.filter((l) => l.bucket === bucketFilter) : leads;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-serif">Prospecção — Olímpia</h1>
            <p className="text-sm text-stone-500">
              Plataforma de operação: descoberta, disparos, conversas e controle do agente.
              {dryRun && <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">DRY-RUN</span>}
            </p>
          </div>
          {/* Global agent switch — the big red button */}
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1.5 text-sm font-medium ${agentEnabled ? 'text-emerald-700' : 'text-rose-700'}`}>
              <span className={`w-2 h-2 rounded-full ${agentEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              {agentEnabled ? 'Agente ativo' : 'Agente PARADO'}
            </span>
            {agentEnabled ? (
              !confirmStop ? (
                <button
                  type="button"
                  onClick={() => setConfirmStop(true)}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-sm font-medium hover:opacity-90"
                >
                  Parar agente
                </button>
              ) : (
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={agentToggle.isPending}
                    onClick={() => agentToggle.mutate(false)}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    Confirmar parada
                  </button>
                  <button type="button" onClick={() => setConfirmStop(false)} className="px-2.5 py-1.5 rounded-xl bg-stone-100 text-stone-600 text-sm hover:bg-stone-200">✕</button>
                </span>
              )
            ) : (
              <button
                type="button"
                disabled={agentToggle.isPending}
                onClick={() => agentToggle.mutate(true)}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                Reativar agente
              </button>
            )}
          </div>
        </header>

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
      </div>
    </DashboardLayout>
  );
}
