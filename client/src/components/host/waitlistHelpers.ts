import { normalizeStatus } from '../../utils/reservationStatus';

export interface WaitlistEntry {
  id: string;
  waitlist_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_whatsapp?: string;
  party_size: number;
  added_at: string;
  estimated_wait: number;
  /** Stored lowercase in the DB (see api/_lib/db/waitlist.js). */
  status: 'waiting' | 'notified' | 'seated' | 'cancelled' | 'no_show';
  priority: number;
  special_requests?: string;
  notified_at?: string;
  source?: 'walk_in' | 'whatsapp' | 'whatsapp_ai' | 'phone' | 'online';
}

export interface WaitlistResponse {
  success: boolean;
  count: number;
  waitlist: WaitlistEntry[];
  plan_gated?: boolean;
}

export function getTags(specialRequests?: string): string[] {
  if (!specialRequests) return [];
  return specialRequests.split(',').map(t => t.trim()).filter(Boolean);
}

export function getStatusColor(status?: string | null): string {
  // Statuses arrive lowercase from the DB; this used to match on capitalized
  // labels only, so every badge fell through to the default grey.
  // normalizeStatus lives under reservationStatus but is a generic
  // trim+lowercase, and unlike a bare .toLowerCase() it survives undefined.
  switch (normalizeStatus(status)) {
    case 'waiting': return 'bg-soft-gray text-stone-gray';
    case 'notified': return 'bg-amber-600/10 text-amber-600';
    case 'seated': return 'bg-emerald-50 text-emerald-700';
    case 'cancelled': return 'bg-red-500/10 text-red-500';
    case 'no_show':
    case 'no show': return 'bg-stone-gray/10 text-stone-gray';
    default: return 'bg-stone-gray/10 text-stone-gray';
  }
}

/** A table-ready notice older than one service day needs review, not a "ready now" claim. */
export function isStaleNotified(entry: WaitlistEntry, now = new Date()): boolean {
  if (normalizeStatus(entry.status) !== 'notified' || !entry.notified_at) return false;
  const notifiedAt = new Date(entry.notified_at).getTime();
  return Number.isFinite(notifiedAt) && now.getTime() - notifiedAt > 24 * 60 * 60 * 1000;
}

export function formatNotifiedTime(value: string, language: string, now = new Date(), timeZone?: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
  const locale = language === 'pt-BR' ? 'pt-BR' : language.startsWith('es') ? 'es-ES' : 'en-US';
  if (elapsedMinutes >= 24 * 60) {
    try {
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(date);
    } catch {
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
    }
  }
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (elapsedMinutes >= 60) return relative.format(-Math.floor(elapsedMinutes / 60), 'hour');
  return relative.format(-elapsedMinutes, 'minute');
}
