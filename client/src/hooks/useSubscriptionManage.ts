import { useQuery, useMutation } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { SETTINGS_STALE_TIME } from '../config/constants';

export interface SubscriptionData {
  status: 'active' | 'trialing' | 'canceled' | 'past_due' | 'none';
  planName: string;
  planPrice: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  trialEnd?: string;
}

export function useSubscriptionData() {
  return useQuery<SubscriptionData | null>({
    queryKey: ['subscription-manage'],
    queryFn: async () => {
      const res = await authFetch('/api/get-subscription');
      if (!res.ok) throw new Error('Failed to fetch subscription');
      return res.json();
    },
    staleTime: SETTINGS_STALE_TIME,
  });
}

export function useCustomerPortal() {
  return useMutation<{ url: string }, Error, void>({
    mutationFn: async () => {
      const res = await authFetch('/api/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to create portal session');
      return res.json();
    },
  });
}
