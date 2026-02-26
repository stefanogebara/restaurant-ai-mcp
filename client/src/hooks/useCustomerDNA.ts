import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { LTV_POLL_INTERVAL, ANALYTICS_STALE_TIME } from '../config/constants';
import type { DNAStats, DNAOccasion, CustomerListItem } from '../components/host/dnaHelpers';
import type { FullProfile } from '../components/host/customerProfile.types';

interface DNAStatsData {
  stats: DNAStats;
  occasions: DNAOccasion[];
}

export function useCustomerDNAStats() {
  return useQuery<DNAStatsData>({
    queryKey: ['customer-dna', 'stats'],
    queryFn: async () => {
      const [statsRes, occRes] = await Promise.all([
        authFetch('/api/customer-dna?action=stats'),
        authFetch('/api/customer-dna?action=occasions&limit=10'),
      ]);
      if (!statsRes.ok || !occRes.ok) throw new Error('Failed to fetch DNA data');
      const [statsResult, occResult] = await Promise.all([statsRes.json(), occRes.json()]);
      return {
        stats: statsResult.success ? statsResult.data : null,
        occasions: occResult.success ? (occResult.data.occasions || []) : [],
      };
    },
    staleTime: ANALYTICS_STALE_TIME,
    refetchInterval: LTV_POLL_INTERVAL,
  });
}

interface DNAListOptions {
  search?: string;
  styleFilter?: string;
}

export function useCustomerDNAList({ search, styleFilter }: DNAListOptions) {
  return useQuery<CustomerListItem[]>({
    queryKey: ['customer-dna', 'list', search, styleFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ action: 'list', limit: '50', offset: '0' });
      if (search) params.set('search', search);
      if (styleFilter) params.set('dining_style', styleFilter);
      const response = await authFetch(`/api/customer-dna?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch customer list');
      const result = await response.json();
      return result.success ? (result.data.profiles || []) : [];
    },
    staleTime: ANALYTICS_STALE_TIME,
  });
}

interface AnalyzeResult {
  total_analyzed: number;
}

export function useAnalyzeAllCustomers() {
  const queryClient = useQueryClient();
  return useMutation<AnalyzeResult, Error, void>({
    mutationFn: async () => {
      const response = await authFetch('/api/customer-dna?action=analyze-all');
      if (!response.ok) throw new Error('Failed to analyze customers');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to analyze');
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-dna'] });
    },
  });
}

export function useCustomerProfile(customerId: string | undefined) {
  return useQuery<FullProfile | null>({
    queryKey: ['customer-profile', customerId],
    queryFn: async () => {
      const res = await authFetch(
        `/api/customer-dna?action=profile&customer_id=${encodeURIComponent(customerId!)}`
      );
      if (!res.ok) throw new Error('Failed to fetch profile');
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to load profile');
      return result.data;
    },
    enabled: !!customerId,
    staleTime: ANALYTICS_STALE_TIME,
  });
}

export function useAnalyzeCustomer() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (customerId) => {
      const res = await authFetch(
        `/api/customer-dna?action=analyze&customer_id=${encodeURIComponent(customerId)}`
      );
      if (!res.ok) throw new Error('Failed to analyze customer');
    },
    onSuccess: (_, customerId) => {
      queryClient.invalidateQueries({ queryKey: ['customer-profile', customerId] });
    },
  });
}
