import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { supabase } from '../lib/supabase';
import { billingPlanFromName } from '../lib/billingHandoff';

interface SessionData {
  status: string;
  payment_status: string;
  subscription_status: string;
  is_trial: boolean;
  access_confirmed: boolean;
  plan: string;
}

export function checkoutResult(data: SessionData | undefined) {
  if (data?.status !== 'complete' || !billingPlanFromName(data.plan)) return null;
  if (data.is_trial === true && data.subscription_status === 'trialing'
    && (data.payment_status === 'no_payment_required' || data.payment_status === 'paid')) return 'trial';
  if (data.is_trial !== false || data.subscription_status !== 'active') return null;
  if (data.payment_status === 'paid') return 'paid';
  if (data.payment_status === 'no_payment_required') return 'active';
  return null;
}

const ACCESS_POLL_INTERVAL_MS = 3000;
const MAX_AUTOMATIC_ACCESS_CHECKS = 10;

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
export function useVerifySession(sessionId: string | null, userId: string | undefined) {
  return useQuery<SessionData>({
    queryKey: ['verify-session', userId, sessionId],
    queryFn: async ({ client, queryKey }) => {
      if (!sessionId) throw new Error('Missing Checkout session ID');
      const query = new URLSearchParams({ session_id: sessionId });
      // Refresh an expired session after returning from Stripe. Once a response
      // is cached, polling can use the current token and refresh only on 401.
      if (!client.getQueryData(queryKey)) {
        try { await supabase.auth.refreshSession(); } catch { /* authFetch surfaces authorization errors */ }
      }

      let res = await authFetch(`/api/verify-session?${query}`);

      // One retry on 401 — covers the narrow window where refreshSession
      // resolved but the new token hadn't propagated to authFetch's
      // getSession() call yet.
      if (res.status === 401) {
        try { await supabase.auth.refreshSession(); } catch { /* ignore */ }
        res = await authFetch(`/api/verify-session?${query}`);
      }

      if (!res.ok) throw new Error('Failed to verify session');
      return res.json();
    },
    enabled: Boolean(sessionId && userId),
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: ({ state }) => {
      const { data, dataUpdateCount, errorUpdateCount } = state;
      // An initial verified result can be followed by ten checks. Count
      // failures too so a Stripe or database outage cannot prolong polling.
      if (!checkoutResult(data) || data?.access_confirmed === true
        || dataUpdateCount + errorUpdateCount > MAX_AUTOMATIC_ACCESS_CHECKS) return false;
      return ACCESS_POLL_INTERVAL_MS;
    },
    retry: false,
  });
}
