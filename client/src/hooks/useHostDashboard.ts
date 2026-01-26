import { useQuery } from '@tanstack/react-query';
import { hostAPI } from '../services/api';
import type { DashboardData } from '../types/host.types';
import { DASHBOARD_POLL_INTERVAL, DASHBOARD_STALE_TIME } from '../config/constants';

export function useHostDashboard() {
  return useQuery<DashboardData>({
    queryKey: ['hostDashboard'],
    queryFn: async () => {
      const response = await hostAPI.getDashboard();
      return response.data;
    },
    refetchInterval: DASHBOARD_POLL_INTERVAL,
    refetchIntervalInBackground: true,
    staleTime: DASHBOARD_STALE_TIME,
  });
}
