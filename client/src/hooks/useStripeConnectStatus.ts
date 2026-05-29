import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export type StripeConnectStatusValue =
  | 'pending'
  | 'active'
  | 'restricted'
  | 'disabled'
  | 'revoked';

export interface StripeConnectStatus {
  success: boolean;
  connected: boolean;
  account_id?: string;
  status?: StripeConnectStatusValue;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  default_currency?: string | null;
  country?: string;
}

/**
 * Shared query for the restaurant's Stripe Connect status.
 *
 * Backed by /api/stripe-connect-status, which reads the local mirror that
 * api/stripe-connect-onboarding.js writes and api/stripe-connect-webhook.js
 * keeps fresh. Multiple consumers (the Voice Settings panel, the dashboard
 * status badge) share the same query key so an invalidation from anywhere
 * — including the `?stripe_connect=ok` return-param effect on the panel —
 * fans out to all subscribers.
 */
export function useStripeConnectStatus() {
  return useQuery<StripeConnectStatus>({
    queryKey: ['stripe-connect-status'],
    queryFn: async () => {
      const res = await authFetch('/api/stripe-connect-status');
      if (!res.ok) return { success: false, connected: false };
      return res.json();
    },
    staleTime: 60_000,
  });
}
