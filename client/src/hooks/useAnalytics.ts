import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { ANALYTICS_POLL_INTERVAL, ANALYTICS_STALE_TIME } from '../config/constants';

export interface AnalyticsData {
  overview: {
    total_reservations: number;
    total_completed_services: number;
    avg_party_size: number;
    avg_service_time_minutes: number;
    total_capacity: number;
    current_occupancy: number;
    current_occupancy_percentage: string;
  };
  reservations_by_status: Record<string, number>;
  reservations_by_day: Record<string, number>;
  reservations_by_time_slot: Record<string, number>;
  table_utilization: Array<{
    table_number: number;
    capacity: number;
    location: string;
    times_used: number;
    utilization_rate: string;
  }>;
  daily_trend: Array<{
    date: string;
    dayName: string;
    reservations: number;
    completed_services: number;
  }>;
  raw_reservations?: Array<{
    date: string;
    time: string;
    customer_name: string;
    party_size: number;
    status: string;
    reservation_id: string;
  }>;
  upgrade_required?: boolean;
  no_restaurant?: boolean;
}

export interface AnalyticsParams {
  startDate?: string;
  endDate?: string;
  period?: string;
  includeExport?: boolean;
}

export function useAnalytics(params: AnalyticsParams = {}) {
  const { startDate, endDate, period = '30d', includeExport = false } = params;

  return useQuery<AnalyticsData>({
    queryKey: ['analytics', period, startDate, endDate, includeExport],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (startDate && endDate) {
        qs.set('start_date', startDate);
        qs.set('end_date', endDate);
      } else {
        qs.set('period', period);
      }
      if (includeExport) qs.set('include_export', 'true');
      const response = await authFetch(`/api/analytics?${qs.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch analytics');
      return { ...result.analytics, upgrade_required: result.upgrade_required ?? false, no_restaurant: result.no_restaurant ?? false };
    },
    refetchInterval: ANALYTICS_POLL_INTERVAL,
    staleTime: ANALYTICS_STALE_TIME,
  });
}
