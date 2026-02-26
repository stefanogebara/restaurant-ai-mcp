/**
 * Usage Stats Hook
 *
 * Fetches current month's usage data for metered billing display.
 */

import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { SUBSCRIPTION_POLL_INTERVAL, SETTINGS_STALE_TIME } from '../config/constants';

export interface UsageMetric {
  metric_type: string;
  total_count: number;
}

interface UsageStatsResponse {
  success: boolean;
  restaurant_id: string;
  period: string | { start: string; end: string };
  usage: UsageMetric[];
}

interface UseUsageStatsOptions {
  start?: string;
  end?: string;
  enabled?: boolean;
}

const METRIC_LABELS: Record<string, string> = {
  reservation_created: 'Reservations',
  portal_booking: 'Portal Bookings',
  whatsapp_reservation: 'WhatsApp Reservations',
  ai_call_completed: 'AI Calls',
  sms_sent: 'SMS Sent',
};

export function getMetricLabel(metricType: string): string {
  return METRIC_LABELS[metricType] || metricType.replace(/_/g, ' ');
}

export function useUsageStats(options: UseUsageStatsOptions = {}) {
  const { start, end, enabled = true } = options;

  return useQuery<UsageStatsResponse>({
    queryKey: ['usage-stats', start, end],
    queryFn: async () => {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const params = start && end ? `?start=${start}&end=${end}` : '';

      const response = await authFetch(`${apiUrl}/api/usage-stats${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch usage stats');
      }

      return response.json();
    },
    enabled,
    staleTime: SETTINGS_STALE_TIME,
    refetchInterval: SUBSCRIPTION_POLL_INTERVAL,
  });
}
