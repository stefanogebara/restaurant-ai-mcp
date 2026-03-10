import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface MetricSummary {
  no_show_rate: number | null;
  avg_revenue_per_cover: number | null;
  conversion_rate: number | null;
  total_reservations: number;
  data_points: number;
}

export interface NoShowPoint { date: string; rate: number; total: number; no_shows: number; }
export interface RevenuePoint { week: string; avg_per_cover: number | null; covers: number; }
export interface ConversionPoint { date: string; rate: number; total: number; confirmed: number; }

export interface StrategyMetricsData {
  range_days: number;
  since: string;
  summary: MetricSummary;
  targets: { no_show_rate: number; avg_revenue_per_cover: number; conversion_rate: number };
  timelines: {
    no_show: NoShowPoint[];
    revenue: RevenuePoint[];
    conversion: ConversionPoint[];
  };
}

export function useStrategyMetrics(range = 30) {
  return useQuery<StrategyMetricsData>({
    queryKey: ['strategyMetrics', range],
    queryFn: async () => {
      const res = await authFetch(`/api/strategy-metrics?range=${range}`);
      const json = await res.json();
      if (!json.success) throw new Error('Failed to load metrics');
      return json.data;
    },
    staleTime: 10 * 60 * 1000,
  });
}
