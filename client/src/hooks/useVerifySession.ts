import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { supabase } from '../lib/supabase';

interface SessionData {
  customer_id?: string;
  plan?: string;
  customer_email?: string;
}

/**
 * Verify a Stripe Checkout session against our backend.
 *
 * Real bug from a live E2E: customer signed up, sat in Stripe Checkout for 2+
 * hours waiting for a 3DS bank approval, then returned to /subscription/success
 * — their Supabase access token had expired during the wait, so verify-session
 * got 401 and the page rendered "Não foi possível confirmar o pagamento" even
 * though Stripe had successfully created the subscription. We now refresh the
 * Supabase session BEFORE calling verify-session, and retry once on 401 in
 * case the refresh raced with the initial call.
 */
export function useVerifySession(sessionId: string | null) {
  return useQuery<SessionData>({
    queryKey: ['verify-session', sessionId],
    queryFn: async () => {
      // Refresh the Supabase session up-front. If the token expired during
      // the Stripe round-trip this gets us a fresh one before authFetch reads
      // the access_token. Failure here doesn't abort — the call below will
      // surface the real auth error if there's no recoverable session.
      try {
        await supabase.auth.refreshSession();
      } catch {
        // Refresh can fail when there's no refresh token at all (e.g. user
        // never logged in, or it was wiped). Fall through — authFetch will
        // either succeed if a still-valid token exists, or return 401.
      }

      let res = await authFetch(`/api/verify-session?session_id=${sessionId}`);

      // One retry on 401 — covers the narrow window where refreshSession
      // resolved but the new token hadn't propagated to authFetch's
      // getSession() call yet.
      if (res.status === 401) {
        try { await supabase.auth.refreshSession(); } catch { /* ignore */ }
        res = await authFetch(`/api/verify-session?session_id=${sessionId}`);
      }

      if (!res.ok) throw new Error('Failed to verify session');
      return res.json();
    },
    enabled: !!sessionId,
    staleTime: Infinity,
    retry: false,
  });
}
