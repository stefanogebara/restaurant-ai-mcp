export interface WaitlistEntry {
  id: string;
  waitlist_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  party_size: number;
  added_at: string;
  estimated_wait: number;
  status: 'Waiting' | 'Notified' | 'Seated' | 'Cancelled' | 'No Show';
  priority: number;
  special_requests?: string;
  notified_at?: string;
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

export function getStatusColor(status: string): string {
  switch (status) {
    case 'Waiting': return 'bg-burgundy/10 text-burgundy';
    case 'Notified': return 'bg-amber-600/10 text-amber-600';
    case 'Seated': return 'bg-green-600/10 text-green-600';
    case 'Cancelled': return 'bg-red-500/10 text-red-500';
    case 'No Show': return 'bg-stone-gray/10 text-stone-gray';
    default: return 'bg-stone-gray/10 text-stone-gray';
  }
}
