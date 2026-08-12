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
    case 'waiting': return 'bg-burgundy/10 text-burgundy';
    case 'notified': return 'bg-amber-600/10 text-amber-600';
    case 'seated': return 'bg-rose-600/10 text-rose-600';
    case 'cancelled': return 'bg-red-500/10 text-red-500';
    case 'no_show':
    case 'no show': return 'bg-stone-gray/10 text-stone-gray';
    default: return 'bg-stone-gray/10 text-stone-gray';
  }
}
