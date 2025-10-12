import { useQuery } from '@tanstack/react-query';
import { hostAPI } from '../services/api';
import type { DashboardData } from '../types/host.types';

export function useHostDashboard() {
  return useQuery<DashboardData>({
    queryKey: ['hostDashboard'],
    queryFn: async () => {
      const response = await hostAPI.getDashboard();
      return response.data;
    },
    refetchInterval: 30000, // Poll every 30 seconds
    refetchIntervalInBackground: true,
    staleTime: 25000, // Consider data stale after 25 seconds
  });
}
