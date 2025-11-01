import { useQuery } from '@tanstack/react-query';

interface AnalyticsData {
  total_reservations: number;
  total_completed_services: number;
  avg_party_size: number;
  avg_service_time_minutes: number;
}

export function useAnalytics() {
  return useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: async () => {
      const response = await fetch('/api/analytics');
      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }
      const data = await response.json();
      return data.overview;
    },
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    staleTime: 4 * 60 * 1000, // Consider data stale after 4 minutes
  });
}
