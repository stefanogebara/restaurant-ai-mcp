import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';

interface SessionData {
  customer_id?: string;
  plan?: string;
  customer_email?: string;
}

export function useVerifySession(sessionId: string | null) {
  return useQuery<SessionData>({
    queryKey: ['verify-session', sessionId],
    queryFn: async () => {
      const res = await authFetch(`/api/verify-session?session_id=${sessionId}`);
      if (!res.ok) throw new Error('Failed to verify session');
      return res.json();
    },
    enabled: !!sessionId,
    staleTime: Infinity,
    retry: false,
  });
}
