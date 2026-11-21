import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface PartySizeRevenue {
  range: string;
  avg_per_cover: number;
  avg_total: number;
  count: number;
}

export interface RevenueStats {
  avg_spend_per_cover: number;
  data_points: number;
  using_default: boolean;
  by_party_size?: PartySizeRevenue[];
}

async function fetchRevenueStats(): Promise<RevenueStats> {
  const res = await authFetch('/api/revenue-stats');
  if (!res.ok) throw new Error('Failed to load revenue stats');
  return res.json() as Promise<RevenueStats>;
}

/**
 * `enabled: false` waits: the dashboard only needs the average spend to price
 * upcoming bookings, so it skips the call when there are none (2026-11-21).
 * The revenue widgets call this without options and always fetch.
 */
export function useRevenueStats({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['revenue-stats'],
    queryFn: fetchRevenueStats,
    staleTime: 2 * 60 * 1000,
    enabled,
  });
}
