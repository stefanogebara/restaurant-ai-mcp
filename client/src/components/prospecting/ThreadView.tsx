import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import type { ProspectLead, ProspectMessage, CannedRow } from './types';
import {
  INTENT_LABEL, INTENTS, fmtTime, fmtCountdown, windowRemainingMs,
  interpolateCanned, apiError,
} from './types';
import { Badge, IntentPill } from './LeadList';

/**
 * Thread workbench (F1/F3/F6/F8): transcript with delivery ticks + inline
 * notes/events, intent override, snooze, private notes, canned responses via
 * '/', pinned context card (conversa_resumo + fatos), 24h-window countdown,
 * and the human-takeover composer.
 */

interface DetailData { lead: ProspectLead; messages: ProspectMessage[]; bucket: string; can_free_text: boolean; }

function Ticks({ m }: { m: ProspectMessage }) {
  if (m.direcao !== 'out' || !m.status) return null;
  if (m.status === 'failed') {
    return (
      <span className="text-[10px] text-rose-600 font-medium" title={m.error_detail || 'falha no envio'}>
        ✕ não entregue
      </span>
    );
  }
  const cls = m.status === 'read' ? 'text-amber-500' : 'text-stone-400';
  const glyph = m.status === 'sent' ? '✓' : '✓✓';
  const statusLabel = m.status === 'read' ? 'lida' : m.status === 'delivered' ? 'entregue' : 'enviada';
  return <span className={`text-[10px] ${cls}`} title={`${statusLabel}${m.status_at ? ` · ${fmtTime(m.status_at)}` : ''}`}>{glyph}</span>;
}

function SysRow({ m }: { m: ProspectMessage }) {
  if (m.tipo === 'nota') {
    return (
      <div className="flex justify-center">
        <div className="max-w-[85%] rounded-xl px-3 py-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-900">
          <span className="font-medium">nota</span> · {m.corpo}
          <span className="text-amber-400 ml-2">{fmtTime(m.enviada_em)}</span>
        </div>
      </div>
    );
  }
  return (
    <p className="text-center text-[11px] text-stone-400 py-0.5">
      {m.corpo} · {fmtTime(m.enviada_em)}
    </p>
  );
}

function ContextCard({ lead }: { lead: ProspectLead }) {
  const fatos = (lead.conversa_fatos || {}) as Record<string, unknown>;
  const linhas: string[] = [];
  if (fatos.is_dono === true) linhas.push('É o dono/responsável');
  if (typeof fatos.nome_responsavel === 'string') linhas.push(`Responsável: ${fatos.nome_responsavel}`);
  if (typeof fatos.email === 'string') linhas.push(`E-mail: ${fatos.email}`);
  if (typeof fatos.disponibilidade === 'string') linhas.push(`Disponibilidade: ${fatos.disponibilidade}`);
  if (Array.isArray(fatos.objecoes) && fatos.objecoes.length) linhas.push(`Objeções: ${(fatos.objecoes as string[]).join('; ')}`);
  if (Array.isArray(fatos.interesses) && fatos.interesses.length) linhas.push(`Interesses: ${(fatos.interesses as string[]).join('; ')}`);
  if (!lead.conversa_resumo && linhas.length === 0) return null;
  return (
    <div className="rounded-xl bg-stone-50/70 border border-stone-100 px-3 py-2 mb-2">
      {lead.conversa_resumo && <p className="text-xs text-stone-900">{lead.conversa_resumo}</p>}
      {linhas.length > 0 && (
        <p className="text-[11px] text-stone-700 mt-0.5">{linhas.join(' · ')}</p>
      )}
    </div>
  );
}

const SNOOZE_PRESETS: Array<{ label: string; compute: (now: Date) => Date }> = [
  {
    label: 'amanhã 9h',
    compute: (now) => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; },
  },
  {
    label: 'sexta 9h',
    compute: (now) => {
      const d = new Date(now); const delta = ((5 - d.getDay()) + 7) % 7 || 7;
      d.setDate(d.getDate() + delta); d.setHours(9, 0, 0, 0); return d;
    },
  },
  {
    label: 'semana que vem',
    compute: (now) => { const d = new Date(now); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d; },
  },
];

export default function ThreadView({ leadId, nowMs }: { leadId: string; nowMs: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [notaMode, setNotaMode] = useState(false);
  const [keepActive, setKeepActive] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  const detailQ = useQuery({
    queryKey: ['prospect-admin', 'lead', leadId],
    queryFn: async () => (await api.get<{ data: DetailData }>(`/prospect-admin?action=lead&lead_id=${leadId}`)).data.data,
    refetchInterval: 10000,
  });

  const cannedQ = useQuery({
    queryKey: ['prospect-admin', 'canned'],
    queryFn: async () => (await api.get<{ data: CannedRow[] }>('/prospect-admin?action=canned')).data.data,
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['prospect-admin'] });

  const act = useMutation({
    mutationFn: async ({ action, body }: { action: string; body: Record<string, unknown> }) =>
      (await api.post(`/prospect-admin?action=${action}`, body)).data,
    onSuccess: invalidate,
    onError: (err: unknown) => toast.error(apiError(err) || 'Ação falhou'),
  });

  const send = useMutation({
    mutationFn: async () => {
      if (notaMode) {
        return (await api.post('/prospect-admin?action=note', { lead_id: leadId, texto: draft.trim() })).data;
      }
      return (await api.post('/prospect-admin?action=send', {
        lead_id: leadId, texto: draft.trim(), keep_active: keepActive,
      })).data;
    },
    onSuccess: () => {
      setDraft('');
      toast.success(notaMode ? 'Nota salva' : 'Mensagem enviada');
      invalidate();
    },
    onError: (err: unknown) => toast.error(apiError(err) || 'Falhou'),
  });

  const detail = detailQ.data;

  // Canned popover: '/'-prefixed draft filters short codes.
  const cannedMatches = useMemo(() => {
    if (notaMode || !draft.startsWith('/')) return [];
    const term = draft.slice(1).toLowerCase();
    return (cannedQ.data ?? []).filter((c) => c.short_code.includes(term)).slice(0, 6);
  }, [draft, cannedQ.data, notaMode]);

  // Erro ANTES de "carregando": a versão anterior checava só isLoading e, num
  // fetch que falha, `detail` fica undefined para sempre — a conversa exibia
  // "Carregando conversa…" eternamente, sem nunca dizer que deu erro.
  if (detailQ.isError) {
    return (
      <div className="text-sm">
        <p className="text-rose-800">Não consegui carregar esta conversa.</p>
        <p className="text-xs text-rose-700 mt-1">
          O histórico e o estado do lead não estão visíveis — evite agir sem vê-los.
          <button type="button" onClick={() => detailQ.refetch()} className="ml-2 underline">tentar de novo</button>
        </p>
      </div>
    );
  }
  if (detailQ.isLoading || !detail) {
    return <p className="text-sm text-stone-500">Carregando conversa…</p>;
  }

  const { lead } = detail;
  const winRem = windowRemainingMs(lead.last_in_at, nowMs);
  const winOpen = winRem !== null && winRem > 0;

  return (
    <>
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-stone-200/60">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-medium truncate">{lead.name}</h2>
            <Badge bucket={detail.bucket} />
            {/* Intent override (F1) */}
            <select
              value={lead.last_intent ?? ''}
              onChange={(e) => act.mutate({ action: 'intent', body: { lead_id: lead.id, intent: e.target.value } })}
              className="text-[11px] rounded-full border border-stone-200 bg-white/70 px-1.5 py-0.5 text-stone-600"
              title="O que o lead quer, na leitura da IA — corrija se estiver errado"
            >
              <option value="" disabled>intenção…</option>
              {INTENTS.map((i) => <option key={i} value={i}>{INTENT_LABEL[i]}</option>)}
            </select>
            {lead.prospect_state === 'pausada' && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs" title="A Olímpia parou de responder este lead — só você responde por aqui">Olímpia pausada</span>
            )}
            {lead.prospect_state === 'ganho' && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-xs" title="Você fechou este lead — a Olímpia não fala mais com ele e ele sai de todas as filas">Fechado 🏆</span>
            )}
          </div>
          <p
            className="text-xs text-stone-500 truncate"
            title={lead.intro_variant ? 'Abordagem A/B: duas primeiras mensagens competindo; a que gera mais resposta vence' : undefined}
          >
            {[lead.owner_name, lead.whatsapp_phone, lead.intro_variant ? `abordagem ${lead.intro_variant}` : null].filter(Boolean).join(' · ')}
            {lead.reuniao_at ? ` · reunião ${fmtTime(lead.reuniao_at)}` : ''}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0 relative">
          <button
            type="button"
            onClick={() => setSnoozeOpen(!snoozeOpen)}
            className="px-2.5 py-1 text-xs rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200"
            title="Adiar — esconder este lead da lista até a data escolhida"
          >
            ⏰
          </button>
          {snoozeOpen && (
            <div className="absolute right-0 top-8 z-10 rounded-xl border border-stone-200 bg-white shadow-lg p-2 space-y-1 w-44">
              {SNOOZE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-stone-50"
                  onClick={() => {
                    act.mutate({ action: 'snooze', body: { lead_id: lead.id, until: p.compute(new Date(nowMs)).toISOString() } });
                    setSnoozeOpen(false);
                  }}
                >
                  {p.label}
                </button>
              ))}
              {lead.snoozed_until && (
                <button
                  type="button"
                  className="w-full text-left text-xs px-2 py-1.5 rounded-lg text-rose-700 hover:bg-rose-50"
                  onClick={() => { act.mutate({ action: 'snooze', body: { lead_id: lead.id, until: null } }); setSnoozeOpen(false); }}
                >
                  remover adiamento
                </button>
              )}
            </div>
          )}
          {lead.prospect_state !== 'ganho' && lead.prospect_state !== 'optout' && (
            <button
              type="button"
              disabled={act.isPending}
              onClick={() => {
                if (window.confirm(`Marcar ${lead.name} como fechado? A Olímpia encerra este lead e ele sai das filas.`)) {
                  act.mutate({ action: 'won', body: { lead_id: lead.id } });
                }
              }}
              className="px-2.5 py-1 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              title="Fechei este cliente — a Olímpia para de falar com ele e ele nunca mais entra em disparo, retomada ou lembrete"
            >
              Fechei 🏆
            </button>
          )}
          <button type="button" disabled={act.isPending} onClick={() => act.mutate({ action: 'pause', body: { lead_id: lead.id } })} className="px-2.5 py-1 text-xs rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50" title="A Olímpia para de responder este lead até você reativar">Pausar</button>
          <button type="button" disabled={act.isPending} onClick={() => act.mutate({ action: 'reactivate', body: { lead_id: lead.id } })} className="px-2.5 py-1 text-xs rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200 disabled:opacity-50" title="A Olímpia volta a responder este lead automaticamente">Reativar</button>
          {/* Opt-out LGPD é irreversível pela tela: o lead sai das filas para
              sempre e nada mais pode ser enviado a ele. Ia SEM confirmação
              nenhuma, enquanto "Fechado" — que é reversível — pedia. Um clique
              errado aqui queima o lead e vira registro legal. */}
          <button
            type="button"
            disabled={act.isPending}
            onClick={() => {
              if (window.confirm(`Registrar que ${lead.name} pediu para NÃO receber mais mensagens?\n\nIsto é um registro de LGPD: o lead sai das filas e a Olímpia nunca mais escreve para ele. Não há desfazer pela tela.`)) {
                act.mutate({ action: 'optout', body: { lead_id: lead.id, reason: 'pediu' } });
              }
            }}
            className="px-2.5 py-1 text-xs rounded-lg bg-rose-100 text-rose-800 hover:bg-rose-200 disabled:opacity-50"
            title="Marca que o lead pediu para não receber mais mensagens (LGPD) — nada mais será enviado a ele"
          >
            Pediu pra sair
          </button>
          {lead.reuniao_at && (
            <>
              <button
                type="button"
                disabled={act.isPending}
                onClick={() => {
                  if (window.confirm('Cancelar o evento na agenda e pedir um novo horário ao lead?')) {
                    act.mutate({ action: 'remarcar', body: { lead_id: lead.id, motivo: 'pedir' } });
                  }
                }}
                className="px-2.5 py-1 text-xs rounded-lg bg-stone-100 text-stone-800 hover:bg-stone-200 disabled:opacity-50"
                title="Cancela o evento no Google Calendar e a Olímpia pede um novo dia/horário ao lead"
              >
                Remarcar
              </button>
              <button
                type="button"
                disabled={act.isPending}
                onClick={() => {
                  if (window.confirm('Marcar como não compareceu? O evento é cancelado e a Olímpia pergunta se o lead quer remarcar.')) {
                    act.mutate({ action: 'remarcar', body: { lead_id: lead.id, motivo: 'noshow' } });
                  }
                }}
                className="px-2.5 py-1 text-xs rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200 disabled:opacity-50"
                title="O lead não apareceu na call — cancela o evento e a Olímpia manda o 'não te encontrei, quer remarcar?'"
              >
                Não veio
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-2">
        <ContextCard lead={lead} />
        {detail.messages.length === 0 && <p className="text-sm text-stone-500">Sem mensagens.</p>}
        {detail.messages.map((m, i) =>
          m.direcao === 'sys' ? (
            <SysRow key={i} m={m} />
          ) : (
            <div key={i} className={`flex ${m.direcao === 'out' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${m.direcao === 'out' ? 'bg-emerald-50 text-stone-800' : 'bg-stone-100 text-stone-800'}`}>
                <p className="whitespace-pre-wrap break-words">{m.corpo ?? `[${m.tipo}]`}</p>
                <p className="text-[10px] text-stone-400 mt-0.5 text-right flex items-center justify-end gap-1">
                  {m.direcao === 'in' && m.intent && <IntentPill intent={m.intent} />}
                  {fmtTime(m.enviada_em)} <Ticks m={m} />
                </p>
              </div>
            </div>
          ))}
      </div>

      {/* Composer: Responder | Nota, canned '/', window countdown */}
      <div className="pt-3 border-t border-stone-200/60 space-y-1.5 relative">
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setNotaMode(false)}
            className={`px-2 py-0.5 rounded-full ${!notaMode ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600'}`}
          >
            Responder
          </button>
          <button
            type="button"
            onClick={() => setNotaMode(true)}
            className={`px-2 py-0.5 rounded-full ${notaMode ? 'bg-amber-500 text-white' : 'bg-stone-100 text-stone-600'}`}
          >
            Nota privada
          </button>
          {!notaMode && winOpen && winRem! < 6 * 60 * 60 * 1000 && (
            <span className="text-amber-700" title="O WhatsApp só permite texto livre até 24h após a última mensagem do lead; depois, só modelo aprovado (Meta) chega">
              janela de 24h fecha em {fmtCountdown(winRem!)}
            </span>
          )}
          {!notaMode && !winOpen && (
            <span className="text-rose-700">
              fora da janela de 24h — o WhatsApp só permite texto livre até 24h após a última mensagem do lead; agora só um modelo aprovado (Meta) chega
            </span>
          )}
        </div>

        {cannedMatches.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl border border-stone-200 bg-white shadow-lg p-1 z-10">
            {cannedMatches.map((c) => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-stone-50 flex gap-2 items-baseline"
                onClick={() => setDraft(interpolateCanned(c.body, lead))}
              >
                <span className="text-xs font-mono text-amber-700 shrink-0">/{c.short_code}</span>
                <span className="text-xs text-stone-500 truncate">{c.body}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder={notaMode
              ? 'Nota interna (nunca vai pro WhatsApp)…'
              : 'Responder como você — "/" para respostas prontas…'}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm resize-none ${notaMode ? 'border-amber-200 bg-amber-50/70' : 'border-stone-200 bg-white/70'}`}
          />
          <button
            type="button"
            disabled={send.isPending || !draft.trim() || (!notaMode && !detail.can_free_text)}
            onClick={() => send.mutate()}
            className={`px-4 rounded-xl text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 self-stretch ${notaMode ? 'bg-amber-500' : 'bg-burgundy'}`}
            title={notaMode
              ? 'Salva a nota interna — nunca vai pro WhatsApp'
              : 'Envia como você e assume a conversa — a Olímpia para de responder este lead (a menos que marque a opção abaixo)'}
          >
            {send.isPending ? '…' : notaMode ? 'Salvar' : 'Enviar'}
          </button>
        </div>
        {!notaMode && (
          <label className="flex items-center gap-1.5 text-xs text-stone-500" title="Desmarcado: ao enviar, a Olímpia para de responder este lead e ele fica com você">
            <input type="checkbox" checked={keepActive} onChange={(e) => setKeepActive(e.target.checked)} />
            manter a Olímpia respondendo este lead depois do meu envio (desmarcado: ela para e o lead fica com você)
          </label>
        )}
      </div>
    </>
  );
}
