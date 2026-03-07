import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';

interface FeedbackStats {
  avg_rating: number | null;
  response_rate: number;
  total: number;
  answered_count: number;
  by_rating: Record<string, number>;
  recent: Array<{
    id: string;
    rating: number;
    comment: string | null;
    customer_name: string | null;
    answered_at: string;
  }>;
}

interface FeedbackConfig {
  enabled: boolean;
  delay_minutes: number;
  message_template: string | null;
}

export function useFeedbackStats(range = '7d') {
  return useQuery({
    queryKey: ['feedback-stats', range],
    queryFn: async () => {
      const res = await apiClient.get(`/api/guest-feedback?action=stats&range=${range}`);
      return res.data.data as FeedbackStats;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useFeedbackConfig() {
  return useQuery({
    queryKey: ['feedback-config'],
    queryFn: async () => {
      const res = await apiClient.get('/api/guest-feedback?action=config');
      return res.data.data as FeedbackConfig;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useUpdateFeedbackConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: Partial<FeedbackConfig>) => {
      const res = await apiClient.patch('/api/guest-feedback?action=config', config);
      return res.data.data as FeedbackConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback-config'] });
    },
  });
}
