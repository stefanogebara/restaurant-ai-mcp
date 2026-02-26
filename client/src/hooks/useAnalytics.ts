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
}

export function useAnalytics() {
  return useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: async () => {
      const response = await authFetch('/api/analytics');
      if (!response.ok) throw new Error('Failed to fetch analytics');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch analytics');
      return result.analytics;
    },
    refetchInterval: ANALYTICS_POLL_INTERVAL,
    staleTime: ANALYTICS_STALE_TIME,
  });
}
