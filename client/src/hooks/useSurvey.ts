import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api as apiClient } from '../services/api';

export interface SurveyConfig {
  enabled: boolean;
  delay_hours: number;
  question: string;
}

export interface SurveyResults {
  avg_rating: number | null;
  count: number;
  distribution: Record<number, number>;
  recent: Array<{
    id: string;
    rating: number;
    comment: string | null;
    customer_name: string | null;
    created_at: string;
  }>;
}

export function useSurveyConfig() {
  return useQuery({
    queryKey: ['survey-config'],
    queryFn: async () => {
      const res = await apiClient.get('/surveys?action=config');
      return res.data.data as SurveyConfig;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useUpdateSurveyConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: Partial<SurveyConfig>) => {
      const res = await apiClient.patch('/surveys?action=config', config);
      return res.data.data as SurveyConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['survey-config'] });
    },
  });
}

export function useSurveyResults(days = 30) {
  return useQuery({
    queryKey: ['survey-results', days],
    queryFn: async () => {
      const res = await apiClient.get(`/surveys?action=results&days=${days}`);
      return res.data.data as SurveyResults;
    },
    staleTime: 5 * 60 * 1000,
  });
}
