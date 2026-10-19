import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { WAITLIST_POLL_INTERVAL } from '../config/constants';
import type { WaitlistEntry, WaitlistResponse } from '../components/host/waitlistHelpers';

export function countActiveWaitlist(entries: WaitlistEntry[]): number {
  return entries.filter(entry => ['waiting', 'notified'].includes(String(entry.status).toLowerCase())).length;
}

/** One shared query feeds the dashboard number and the detailed waitlist. */
export function useWaitlistEntries() {
  return useQuery<WaitlistResponse>({
    queryKey: ['waitlist', 'all'],
    queryFn: async () => {
      const response = await authFetch('/api/waitlist');
      if (!response.ok) throw new Error('Failed to fetch waitlist');
      const body = await response.json();
      if (!body.success) throw new Error('Failed to fetch waitlist');
      // The plan-gated response intentionally has no `waitlist` property.
      return { ...body, waitlist: Array.isArray(body.waitlist) ? body.waitlist : [] } as WaitlistResponse;
    },
    refetchInterval: WAITLIST_POLL_INTERVAL,
  });
}
