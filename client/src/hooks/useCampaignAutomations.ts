import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api as apiClient } from '../services/api';

export interface CampaignAutomation {
  id: string;
  restaurant_id: string;
  trigger_type: string;
  enabled: boolean;
  channel: 'email' | 'whatsapp';
  delay_minutes: number;
  google_review_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateAutomationParams {
  trigger_type: string;
  enabled?: boolean;
  channel?: 'email' | 'whatsapp';
  delay_minutes?: number;
  google_review_url?: string | null;
}

export function useAutomations() {
  return useQuery({
    queryKey: ['campaign-automations'],
    queryFn: async () => {
      const res = await apiClient.get('/campaign-automations');
      return res.data.data as CampaignAutomation[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: UpdateAutomationParams) => {
      const res = await apiClient.patch('/campaign-automations', params);
      return res.data.data as CampaignAutomation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-automations'] });
    },
  });
}
