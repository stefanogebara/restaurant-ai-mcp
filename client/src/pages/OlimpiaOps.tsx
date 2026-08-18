import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { GlassCard, GlassPanel } from '../components/common/glass';
import { useToast } from '../contexts/ToastContext';
import DiscoveryPanel from '../components/prospecting/DiscoveryPanel';
import WaIdentityPanel from '../components/prospecting/WaIdentityPanel';
import VariantsPanel from '../components/prospecting/VariantsPanel';
import InsightsPanel from '../components/prospecting/InsightsPanel';
import GymPanel from '../components/prospecting/GymPanel';
import LeadList, { Badge, orderForTab } from '../components/prospecting/LeadList';
import ThreadView from '../components/prospecting/ThreadView';
import { HealthInline, DispatchPausedBanner } from '../components/prospecting/HealthCard';
import MotorStrip from '../components/prospecting/MotorStrip';
import type { ProspectLead, Overview } from '../components/prospecting/types';
import { fmtTime, httpStatus } from '../components/prospecting/types';

/**
 * Olímpia Ops — the STANDALONE prospecting console (Phase 7 + 8), deliberately
 * outside the restaurant product. Access: Google login + PROSPECTING_ADMIN_EMAILS
 * allowlist enforced server-side (403 → restricted screen).
 *
 * Layout: header (health + kill switch) → breaker banner → status strip →
 * meetings → section tabs (Conversas is the default working view; Descobrir &
 * Disparar, Abordagens, Identidade, Insights and Academia each own a tab —
 * one section fully visible at a time, no accordions).
 */

type Section = 'conversas' | 'descobrir' | 'abordagens' | 'whatsapp' | 'insights' | 'academia';

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'conversas', label: 'Conversas' },
  { id: 'descobrir', label: 'Descobrir & Disparar' },
  { id: 'abordagens', label: 'Abordagens (A/B)' },
  { id: 'whatsapp', label: 'Identidade do WhatsApp' },
  { id: 'insights', label: 'Insights' },
  { id: 'academia', label: 'Academia da Olímpia' },
];

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

/**
 * Legenda das respostas. A taxa é calculada sobre as respostas HUMANAS quando
 * dá pra saber: metade dos "respondeu" é o WhatsApp Business da casa mandando
 * "agradecemos seu contato" (168 de 350 leads, medido em 12/08). Comparar
 * autoresponder com o baseline de 2% de cold outreach é elogio inventado.
 */
export function replyCaption(sent: number, replied: number, humanas: number | null): string | undefined {
  if (!sent) return undefined;
  const base = humanas ?? replied;
  const rate = Math.round((1000 * base) / sent) / 10;
  const sufixo = humanas === null || humanas === replied
    ? ''
    : ` · ${replied - humanas} de robô`;
  if (rate >= 4) return `${rate}% de gente — acima do baseline genérico (2%)${sufixo}`;
  if (rate >= 2) return `${rate}% de gente — no baseline genérico${sufixo}`;
  return `${rate}% de gente${sufixo}`;
}

/**
 * Legenda do KPI de fecho. Para o Racha o número sozinho não diz nada: 5 demos
 * é ótimo com 10 respostas e péssimo com 349. Mostra a conversão contra quem
 * respondeu, que é o denominador de que o número depende.
 */
function fechoCaption(fecho: Overview['fecho']): string | undefined {
  if (!fecho || fecho.tipo !== 'demo') return undefined;
  if (!fecho.universo) return 'ninguém respondeu nos últimos 30 dias';
  const taxa = Math.round((1000 * fecho.valor) / fecho.universo) / 10;
  return `${taxa}% de quem respondeu (${fecho.valor} de ${fecho.universo})`;
}

/** Verde só quando a conversão é real; zero-de-muitos precisa doer. */
function fechoTone(fecho: Overview['fecho']): 'good' | 'warn' | undefined {
  if (!fecho) return undefined;
  if (fecho.tipo === 'reuniao') return fecho.valor > 0 ? 'good' : undefined;
  if (!fecho.universo) return undefined;
  const taxa = (100 * fecho.valor) / fecho.universo;
  if (taxa >= 20) return 'good';
  // Gente respondendo e quase ninguém vendo o demo é o gargalo do funil,
  // não um detalhe neutro.
  return fecho.universo >= 20 ? 'warn' : undefined;
}

export default function OlimpiaOps() {
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('conversas');
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
  // Verdadeiro só quando NENHUMA das duas consultas trouxe estado. É o que
  // separa "o agente está ligado" de "não consegui perguntar".
  const estadoDesconhecido =
    ov?.agent_enabled === undefined && listQ.data?.agent_enabled === undefined;
  const agentEnabled = ov?.agent_enabled ?? listQ.data?.agent_enabled ?? true;
  const dryRun = ov?.dry_run ?? listQ.data?.dry_run ?? true;
  const triagemCount = orderForTab(leads, 'triagem', null, nowMs).length;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/60 border-b border-stone-200/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-lg">Olímpia <span className="text-stone-400">·</span> Ops</h1>
            {dryRun && (
              <span
                className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium"
                title="Modo de teste: a Olímpia simula tudo, mas nenhuma mensagem real é enviada"
              >
                MODO TESTE — nada é enviado
              </span>
            )}
            {ov && <HealthInline ov={ov} />}
          </div>
          <div className="flex items-center gap-2">
            {/* Sem dado de nenhuma das duas consultas, o estado do agente é
                DESCONHECIDO. A versão anterior caía no `?? true` e pintava
                "Agente ativo" em verde pulsante mesmo com o backend fora — a
                mentira mais cara desta tela. */}
            {estadoDesconhecido ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-stone-500" title="As duas consultas de estado falharam. Não dá para afirmar se a Olímpia está respondendo.">
                <span className="w-2 h-2 rounded-full bg-stone-400" />
                Agente: não sei dizer
              </span>
            ) : (
              <span className={`flex items-center gap-1.5 text-sm font-medium ${agentEnabled ? 'text-emerald-700' : 'text-rose-700'}`}>
                <span className={`w-2 h-2 rounded-full ${agentEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                {agentEnabled ? 'Agente ativo' : 'Agente PARADO'}
              </span>
            )}
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
        <MotorStrip />

        {/* Overview caiu: os números abaixo viram '—' silenciosos e o banner de
            disparo pausado some. Dizer isso é mais honesto que a tela em branco. */}
        {overviewQ.isError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-2">
            <p className="text-xs text-rose-800">
              Não consegui carregar os números do dia — o que aparece abaixo pode estar desatualizado ou vazio.
              <button type="button" onClick={() => overviewQ.refetch()} className="ml-2 underline">tentar de novo</button>
            </p>
          </div>
        )}

        {ov && <DispatchPausedBanner ov={ov} />}

        <GlassPanel className="p-2 flex flex-wrap divide-x divide-stone-200/60">
          <Stat label="Mensagens enviadas hoje" value={ov ? ov.sent_today : '—'} />
          <Stat
            label="Limite de hoje"
            value={ov ? ov.daily_cap : '—'}
            tone={ov && ov.sent_today >= ov.daily_cap ? 'warn' : undefined}
            caption="cresce aos poucos pra proteger o número"
          />
          <Stat
            label="Respostas hoje"
            value={ov ? (ov.received_today_humano ?? ov.received_today) : '—'}
            tone={ov && (ov.received_today_humano ?? ov.received_today) > 0 ? 'good' : undefined}
            caption={ov ? replyCaption(ov.sent_today, ov.received_today, ov.received_today_humano) : undefined}
          />
          <Stat label="Lembretes na fila" value={ov ? ov.due_followups : '—'} caption="leads que não responderam ainda" />
          {/*
            O passo que move o funil, conforme o produto ativo. "Reuniões
            marcadas" ficou aqui por meses valendo ZERO: o Racha remove
            agendar_demo do toolset, então a agente não consegue marcar reunião.
            Número que nunca muda ensina a ignorar o painel — e escondia o que
            decide: 349 responderam, 5 receberam o demo.
          */}
          <Stat
            label={ov?.fecho?.tipo === 'demo' ? 'Demos enviados (30d)' : 'Reuniões marcadas'}
            value={ov ? (ov.fecho ? ov.fecho.valor : ov.meetings.length) : '—'}
            tone={fechoTone(ov?.fecho ?? null)}
            caption={fechoCaption(ov?.fecho ?? null)}
          />
          <Stat label="Conversas (30 dias)" value={ov?.outcomes?.total ?? 0} />
          <Stat label="Nota das conversas" value={ov?.outcomes?.media_qualidade ?? '—'} caption="0 a 5, avaliada por IA" />
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

        {/* Section tabs — one section fully visible at a time */}
        <nav className="flex flex-wrap gap-1.5" aria-label="Seções do console">
          {SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-expanded={section === id}
              onClick={() => setSection(id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                section === id
                  ? 'bg-stone-800 text-white shadow-sm'
                  : 'bg-white/60 border border-stone-200/70 text-stone-600 hover:bg-stone-100'
              }`}
            >
              {label}
              {id === 'conversas' && triagemCount > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[11px] ${section === id ? 'bg-white/20' : 'bg-burgundy/10 text-burgundy'}`}>
                  {triagemCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {section === 'descobrir' && <DiscoveryPanel />}
        {section === 'whatsapp' && <WaIdentityPanel />}
        {section === 'abordagens' && <VariantsPanel />}
        {section === 'insights' && <InsightsPanel />}
        {section === 'academia' && <GymPanel />}

        {section === 'conversas' && (
          <>
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
                failed={listQ.isError}
                onRetry={() => listQ.refetch()}
                nowMs={nowMs}
              />
              <GlassCard className="p-4 flex flex-col max-h-[70vh]">
                {!selected && <p className="text-sm text-stone-500 m-auto">Selecione um lead para ver a conversa.</p>}
                {selected && <ThreadView leadId={selected} nowMs={nowMs} />}
              </GlassCard>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
