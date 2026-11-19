import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
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

export function useStripeConnectStatusKey() {
  const { user } = useAuth();
  return ['stripe-connect-status', user?.id] as const;
}

export function useStripeConnectStatus() {
  const queryKey = useStripeConnectStatusKey();
  return useQuery<StripeConnectStatus>({
    queryKey,
    enabled: Boolean(queryKey[1]),
    queryFn: async () => {
      const res = await authFetch('/api/stripe-connect-status');
      if (!res.ok) throw new Error('Could not read Stripe status');
      return res.json();
    },
    staleTime: 60_000,
  });
}
