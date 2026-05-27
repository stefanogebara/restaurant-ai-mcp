import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { LTV_POLL_INTERVAL, ANALYTICS_STALE_TIME } from '../config/constants';
import { usePlanFeature } from './usePlanFeature';
import type { Customer, LTVStats } from '../components/host/ltvDashboard.types';

// All LTV queries are gated on `customerLTV` plan access. Audit BUG #22 found
// the Insights page was firing 12 × 403s per mount because the hooks ran
// unconditionally for trial users who don't have the feature.

export function useLTVStats() {
  const { hasAccess } = usePlanFeature('customerLTV');
  return useQuery<LTVStats | null>({
    queryKey: ['ltv', 'stats'],
    queryFn: async () => {
      const response = await authFetch('/api/ltv?action=stats');
      if (!response.ok) throw new Error('Failed to fetch LTV stats');
      const result = await response.json();
      return result.success ? result.data : null;
    },
    enabled: hasAccess,
    staleTime: ANALYTICS_STALE_TIME,
    refetchInterval: LTV_POLL_INTERVAL,
  });
}

export function useLTVTopVIPs() {
  const { hasAccess } = usePlanFeature('customerLTV');
  return useQuery<Customer[]>({
    queryKey: ['ltv', 'vips'],
    queryFn: async () => {
      const response = await authFetch('/api/ltv?action=list&tier=vip&limit=5');
      if (!response.ok) throw new Error('Failed to fetch VIP customers');
      const result = await response.json();
      return result.success ? (result.data.customers || []) : [];
    },
    enabled: hasAccess,
    staleTime: ANALYTICS_STALE_TIME,
    refetchInterval: LTV_POLL_INTERVAL,
  });
}

export function useLTVAtRisk() {
  const { hasAccess } = usePlanFeature('customerLTV');
  return useQuery<Customer[]>({
    queryKey: ['ltv', 'at-risk'],
    queryFn: async () => {
      const response = await authFetch('/api/ltv?action=list&limit=100');
      if (!response.ok) throw new Error('Failed to fetch customers');
      const result = await response.json();
      if (!result.success) return [];
      return (result.data.customers as Customer[])
        .filter((c) => c.churn_risk_score > 70)
        .sort((a, b) => b.churn_risk_score - a.churn_risk_score)
        .slice(0, 5);
    },
    enabled: hasAccess,
    staleTime: ANALYTICS_STALE_TIME,
    refetchInterval: LTV_POLL_INTERVAL,
  });
}

interface RecalculateResult {
  total_customers: number;
}

export function useRecalculateLTV() {
  const queryClient = useQueryClient();
  return useMutation<RecalculateResult, Error, void>({
    mutationFn: async () => {
      const response = await authFetch('/api/ltv?action=calculate-all');
      if (!response.ok) throw new Error('Failed to calculate LTV');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed');
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ltv'] });
    },
  });
}

interface CampaignInput {
  customerId: string;
  campaignType: string;
  message: string;
}

export function useSendCampaign() {
  return useMutation<void, Error, CampaignInput>({
    mutationFn: async ({ customerId, campaignType, message }) => {
      const response = await authFetch('/api/retention-campaigns?action=create', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: customerId,
          campaign_type: campaignType,
          message,
          channel: 'email',
        }),
      });
      if (!response.ok) throw new Error('Failed to create campaign');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to create campaign');
    },
  });
}
