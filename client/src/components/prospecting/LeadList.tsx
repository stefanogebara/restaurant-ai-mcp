import { useEffect, useMemo } from 'react';
import { GlassCard } from '../common/glass';
import type { ProspectLead } from './types';
import { BUCKET_LABEL, BUCKET_CLASS, INTENT_LABEL, INTENT_CLASS, triagePriority, relTime } from './types';

/**
 * Lead list (F1): the Triagem tab is the operator's work queue — ordered by
 * urgency (quer_humano → interessado → open questions → window-closing), not
 * by recency. Todos keeps the full pool with funnel filtering. j/k + Enter
 * keyboard navigation; Esc clears selection.
 */

export function Badge({ bucket }: { bucket: string }) {
  return (
    <span
      title="Em que ponto da conversa este lead está"
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${BUCKET_CLASS[bucket] ?? 'bg-stone-100 text-stone-600'}`}
    >
      {BUCKET_LABEL[bucket] ?? bucket}
    </span>
  );
}

export function IntentPill({ intent }: { intent: string | null }) {
  if (!intent) return null;
  return (
    <span
      title="O que o lead quis dizer na última mensagem (classificado automaticamente)"
      className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${INTENT_CLASS[intent] ?? 'bg-stone-100 text-stone-600'}`}
    >
      {INTENT_LABEL[intent] ?? intent}
    </span>
  );
}

interface Props {
  leads: ProspectLead[];
  tab: 'triagem' | 'todos';
  bucketFilter: string | null;
  selected: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  nowMs: number;
}

/** Needs-attention heuristic: an active conversation whose lead spoke recently. */
function isHot(l: ProspectLead, nowMs: number): boolean {
  if (!l.last_in_at) return false;
  const age = nowMs - new Date(l.last_in_at).getTime();
  return age < 24 * 60 * 60 * 1000 && ['replied', 'scheduling', 'handoff'].includes(l.bucket);
}

function isSnoozed(l: ProspectLead, nowMs: number): boolean {
  return !!l.snoozed_until && new Date(l.snoozed_until).getTime() > nowMs;
}

export function orderForTab(leads: ProspectLead[], tab: 'triagem' | 'todos', bucketFilter: string | null, nowMs: number): ProspectLead[] {
  if (tab === 'todos') {
    return bucketFilter ? leads.filter((l) => l.bucket === bucketFilter) : leads;
  }
  // Triagem: only leads that need eyes — active/attention states, minus snoozed.
  return leads
    .filter((l) => !isSnoozed(l, nowMs))
    .filter((l) =>
      ['replied', 'scheduling', 'handoff'].includes(l.bucket) ||
      (l.last_intent && !['nao_interessado'].includes(l.last_intent)))
    .sort((a, b) => {
      const pa = triagePriority(a, nowMs);
      const pb = triagePriority(b, nowMs);
      if (pa !== pb) return pa - pb;
      const ta = a.last_in_at ? new Date(a.last_in_at).getTime() : 0;
      const tb = b.last_in_at ? new Date(b.last_in_at).getTime() : 0;
      return tb - ta;
    });
}

export default function LeadList({ leads, tab, bucketFilter, selected, onSelect, loading, nowMs }: Props) {
  const shown = useMemo(
    () => orderForTab(leads, tab, bucketFilter, nowMs),
    [leads, tab, bucketFilter, nowMs],
  );

  // j/k + Enter keyboard navigation (quick win) — skipped while typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!['j', 'k'].includes(e.key)) return;
      const idx = shown.findIndex((l) => l.id === selected);
      const next = e.key === 'j' ? Math.min(idx + 1, shown.length - 1) : Math.max(idx - 1, 0);
      if (shown[next]) onSelect(shown[next].id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, selected, onSelect]);

  return (
    <GlassCard className="p-3 max-h-[70vh] overflow-y-auto">
      <p className="text-xs text-stone-500 px-3 pb-1.5">
        {tab === 'triagem'
          ? 'Quem precisa de você agora — os mais urgentes primeiro. Dica: as teclas J e K navegam pela lista.'
          : 'Todos os leads da campanha. Dica: as teclas J e K navegam pela lista.'}
      </p>
      {loading && <p className="p-3 text-sm text-stone-500">Carregando…</p>}
      {shown.map((l) => {
        const hot = isHot(l, nowMs);
        const snoozed = isSnoozed(l, nowMs);
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => onSelect(l.id)}
            className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${selected === l.id ? 'bg-amber-50' : 'hover:bg-stone-50'} ${snoozed ? 'opacity-60' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`truncate ${hot ? 'font-semibold' : 'font-medium'}`}
                title={hot ? 'Este lead escreveu nas últimas 24h — bom momento para responder' : undefined}
              >
                {hot && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 align-middle" />}
                {l.name}
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <IntentPill intent={l.last_intent} />
                <Badge bucket={l.bucket} />
                <span
                  className="text-[11px] text-stone-400 w-8 text-right"
                  title="Tempo desde a última atividade (m = minutos, h = horas, d = dias)"
                >{relTime(l.last_in_at || l.updated_at, nowMs)}</span>
              </span>
            </div>
            <div className="text-xs text-stone-500 truncate">
              {[l.city, l.sector, l.whatsapp_phone].filter(Boolean).join(' · ')}
              {snoozed && l.snoozed_until && (
                <span className="ml-1 text-stone-400" title="Você adiou este lead — ele volta para a fila nesta data">· adiado até {new Date(l.snoozed_until).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              )}
              {(l.touch_count ?? 1) > 1 && !l.last_in_at && (
                <span className="ml-1 text-stone-400" title={`Já recebeu ${l.touch_count} das 3 mensagens da sequência e ainda não respondeu`}>· lembrete {l.touch_count}/3</span>
              )}
            </div>
          </button>
        );
      })}
      {!loading && shown.length === 0 && (
        <p className="p-3 text-sm text-stone-500">
          {tab === 'triagem'
            ? 'Fila limpa — nenhum lead precisando de atenção agora. 🎉'
            : bucketFilter
              ? 'Nenhum lead nesta etapa.'
              : 'Nenhum lead ainda.'}
        </p>
      )}
    </GlassCard>
  );
}
