import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { ANALYTICS_STALE_TIME } from '../config/constants';
import type { WeeklyReportData } from '../components/dashboard/weeklyReport.types';

export function useWeeklyReport(startDate: string, endDate: string) {
  return useQuery<WeeklyReportData | null>({
    queryKey: ['weekly-report', startDate, endDate],
    queryFn: async () => {
      const res = await authFetch(`/api/reports?action=weekly&start_date=${startDate}&end_date=${endDate}`);
      if (!res.ok) throw new Error('Failed to fetch report');
      const result = await res.json();
      return result.success ? result.data : null;
    },
    enabled: !!startDate && !!endDate,
    staleTime: ANALYTICS_STALE_TIME,
  });
}
