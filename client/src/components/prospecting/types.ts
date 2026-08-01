/**
 * Shared types + pure helpers for the Olímpia Ops console (Phase 8).
 */

export interface ProspectLead {
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
  last_intent: string | null;
  last_intent_at: string | null;
  last_in_at: string | null;
  snoozed_until: string | null;
  intro_variant: string | null;
  touch_count: number | null;
  next_touch_at: string | null;
  conversa_resumo?: string | null;
  conversa_fatos?: Record<string, unknown> | null;
}

export interface ProspectMessage {
  direcao: 'in' | 'out' | 'sys';
  corpo: string | null;
  tipo: string | null;
  enviada_em: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed' | null;
  status_at?: string | null;
  error_detail?: string | null;
  intent?: string | null;
}

export interface NumberHealth {
  rating: 'GREEN' | 'YELLOW' | 'RED' | string;
  failed_rate_24h: number;
  failed_24h: number;
  sends_24h: number;
  events: Array<{ event_type: string; rating: string | null; detail: string | null; created_at: string }>;
}

export interface Overview {
  agent_enabled: boolean;
  dispatch_enabled: boolean;
  dispatch_note: string | null;
  dry_run: boolean;
  daily_cap: number;
  sent_today: number;
  received_today: number;
  due_followups: number;
  meetings: Array<{ id: string; name: string; city: string | null; reuniao_at: string; reuniao_link: string | null }>;
  outcomes: { total?: number; por_outcome?: Record<string, number>; media_qualidade?: number | null } | null;
  health: NumberHealth;
}

export interface TemplateRow {
  id: string;
  variant_label: string;
  touch_number: number;
  meta_template_name: string;
  template_lang: string;
  body_preview: string | null;
  active: boolean;
}

export interface VariantFunnelRow {
  variant: string;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  booked: number;
  optout: number;
  avg_quality: number | null;
}

export interface CannedRow { id: string; short_code: string; body: string; }

export interface Insights {
  dias: number;
  temas: Array<{ tema: string; n: number; delta: number }>;
  contactados: number;
  responderam: number;
  taxa_resposta: number | null;
  mediana_horas_primeira_resposta: number | null;
  mediana_msgs_ate_reuniao: number | null;
  segmentos: Array<{ variant: string; score_band: string; leads: number; booked: number; avg_quality: number | null }>;
}

export const BUCKET_LABEL: Record<string, string> = {
  pending: 'Na fila', sent: 'Recebeu mensagem', seen: 'Visualizou', replied: 'Respondeu',
  scheduling: 'Marcando reunião', booked: 'Reunião marcada', won: 'Fechado 🏆',
  handoff: 'Precisa de você', porteiro: 'Só robô atendeu', refused: 'Disse não',
  optout: 'Pediu pra sair', failed: 'Não entregue',
};

export const BUCKET_CLASS: Record<string, string> = {
  won: 'bg-emerald-600 text-white',
  booked: 'bg-emerald-100 text-emerald-800', replied: 'bg-emerald-100 text-emerald-800',
  scheduling: 'bg-sky-100 text-sky-800', seen: 'bg-sky-100 text-sky-800',
  sent: 'bg-stone-100 text-stone-700', pending: 'bg-stone-100 text-stone-600',
  handoff: 'bg-amber-100 text-amber-800', porteiro: 'bg-stone-200 text-stone-700',
  refused: 'bg-stone-300 text-stone-800',
  optout: 'bg-rose-100 text-rose-800', failed: 'bg-rose-100 text-rose-800',
};

/**
 * Deals/conversations that are over — never in the work queue.
 * 'refused' entrou em 01/08: quem disse não estava caindo em 'replied' (verde
 * "Respondeu") e ficava preso na Triagem para sempre.
 */
export const TERMINAL_BUCKETS = ['won', 'optout', 'refused'];

export const INTENT_LABEL: Record<string, string> = {
  interessado: 'Interessado', pergunta: 'Pergunta', objecao_preco: 'Objeção preço',
  nao_interessado: 'Não interessado', pessoa_errada: 'Pessoa errada',
  remarcar: 'Remarcar', quer_humano: 'Quer humano', outro: 'Outro',
};

export const INTENT_CLASS: Record<string, string> = {
  interessado: 'bg-emerald-100 text-emerald-800',
  pergunta: 'bg-sky-100 text-sky-800',
  objecao_preco: 'bg-amber-100 text-amber-800',
  remarcar: 'bg-sky-100 text-sky-800',
  quer_humano: 'bg-rose-100 text-rose-800',
  nao_interessado: 'bg-stone-100 text-stone-600',
  pessoa_errada: 'bg-stone-100 text-stone-600',
  outro: 'bg-stone-100 text-stone-600',
};

export const INTENTS = Object.keys(INTENT_LABEL);

/** Triage priority: who the operator should look at first. Lower = higher. */
export function triagePriority(lead: ProspectLead, nowMs: number): number {
  if (TERMINAL_BUCKETS.includes(lead.bucket)) return 99; // closed — nothing to do
  if (lead.snoozed_until && new Date(lead.snoozed_until).getTime() > nowMs) return 90; // parked
  if (lead.bucket === 'handoff' || lead.last_intent === 'quer_humano') return 0;
  if (lead.last_intent === 'interessado') return 1;
  if (lead.last_intent === 'pergunta' || lead.last_intent === 'objecao_preco') return 2;
  // 24h window closing soon on an active conversation
  const rem = windowRemainingMs(lead.last_in_at, nowMs);
  if (rem !== null && rem > 0 && rem < 4 * 60 * 60 * 1000) return 3;
  if (lead.bucket === 'replied' || lead.bucket === 'scheduling') return 4;
  return 50;
}

/** Remaining ms of Meta's 24h free-text window; null when never replied. */
export function windowRemainingMs(lastInAt: string | null | undefined, nowMs: number): number | null {
  if (!lastInAt) return null;
  const t = new Date(lastInAt).getTime();
  if (Number.isNaN(t)) return null;
  return t + 24 * 60 * 60 * 1000 - nowMs;
}

/** '3m', '2h', '5d' — compact relative time for list rows. */
export function relTime(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** 'fecha em 5h12' — countdown formatting for the composer window banner. */
export function fmtCountdown(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h${String(m % 60).padStart(2, '0')}` : `${m}min`;
}

/** Interpolate canned-response placeholders from the open lead (client-side). */
export function interpolateCanned(body: string, lead: Pick<ProspectLead, 'name' | 'city' | 'owner_name'>): string {
  const nome = (lead.owner_name || '').trim().split(/\s+/)[0] || '';
  return body
    .replace(/\{\{\s*nome\s*\}\}/gi, nome)
    .replace(/\{\{\s*cidade\s*\}\}/gi, lead.city || '')
    .replace(/\{\{\s*restaurante\s*\}\}/gi, lead.name || '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function httpStatus(err: unknown): number | null {
  return (err as { response?: { status?: number } })?.response?.status ?? null;
}

export function apiError(err: unknown): string | null {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? null;
}
