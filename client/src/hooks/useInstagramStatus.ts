/**
 * React Query hook for the Instagram connection status. One source of
 * truth so the InstagramPanel + a future status badge can share the same
 * cache key and re-render in lockstep when a connect/disconnect lands.
 */

import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export type InstagramStatus = 'active' | 'expired' | 'revoked' | 'restricted';

export interface InstagramStatusValue {
  success: boolean;
  connected: boolean;
  status: InstagramStatus | null;
  username: string | null;
  profile_picture_url: string | null;
  followers_count: number | null;
  last_sync_at: string | null;
  last_error: string | null;
  token_expires_at: string | null;
  tone_profile_ready: boolean;
}

const STATUS_QUERY_KEY = ['instagram-status'] as const;

export function useInstagramStatus() {
  return useQuery<InstagramStatusValue, Error>({
    queryKey: STATUS_QUERY_KEY,
    queryFn: async () => {
      const res = await authFetch('/api/instagram/status', { method: 'GET' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export { STATUS_QUERY_KEY as INSTAGRAM_STATUS_QUERY_KEY };
