import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { DASHBOARD_POLL_INTERVAL, ANALYTICS_POLL_INTERVAL, ANALYTICS_STALE_TIME } from '../config/constants';

export interface MLROIData {
  summary: {
    total_interventions: number;
    total_cost: string;
    total_value_saved: string;
    total_roi: string;
    target_roi: string;
    meets_target: boolean;
  };
  outcomes: {
    showed_up: number;
    no_show: number;
    cancelled: number;
  };
  intervention_effectiveness: {
    interventions_with_action: number;
    successful_interventions: number;
    success_rate: string;
  };
}

export function useMLROI() {
  return useQuery<MLROIData>({
    queryKey: ['ml-roi'],
    queryFn: async () => {
      const response = await authFetch('/api/ml-outcomes?action=roi-summary');
      if (!response.ok) throw new Error('Failed to fetch ML ROI');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed');
      return result.data;
    },
    staleTime: DASHBOARD_POLL_INTERVAL - 5000,
    refetchInterval: DASHBOARD_POLL_INTERVAL,
  });
}

export interface QuickStats {
  today_interventions: number;
  today_change: string;
  weekly_roi: number;
  roi_status: 'exceeds' | 'meets' | 'below';
  value_saved_30d: number;
  value_saved_trend: string;
  success_rate: number;
  success_status: 'good' | 'fair' | 'needs_improvement';
}

export function useQuickStats() {
  return useQuery<QuickStats>({
    queryKey: ['ml-quick-stats'],
    queryFn: async () => {
      // Backend resolves restaurant_id from the JWT — no need to read from
      // localStorage (which was never populated). Drop the empty query param.
      const response = await authFetch(`/api/ml-performance?action=quick-stats`);
      if (!response.ok) throw new Error('Failed to fetch quick stats');
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch stats');
      return result.data;
    },
    staleTime: ANALYTICS_STALE_TIME,
    refetchInterval: ANALYTICS_POLL_INTERVAL,
  });
}
