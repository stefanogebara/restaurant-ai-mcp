import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api as apiClient } from '../services/api';

export interface Campaign {
  id: string;
  campaign_type: string;
  message: string;
  channel: string;
  status: string;
  scheduled_at: string | null;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  created_at: string;
  segment_name: string;
  whatsapp_template_name: string | null;
  recipient_count: number;
}

export interface CampaignDeliveryStats {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  opted_out: number;
}

export interface SegmentCounts {
  all: number;
  vip: number;
  at_risk: number;
  birthday_this_month: number;
  inactive_30d: number;
  new_customers: number;
}

export function useCampaignList() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const res = await apiClient.get('/retention-campaigns?action=list&limit=50');
      return res.data.data.campaigns as Campaign[];
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useCampaignDeliveryStats(campaignId: string | null) {
  return useQuery({
    queryKey: ['campaign-stats', campaignId],
    queryFn: async () => {
      const res = await apiClient.get(`/retention-campaigns?action=campaign_stats&campaign_id=${campaignId}`);
      return res.data.data as CampaignDeliveryStats;
    },
    enabled: !!campaignId,
    staleTime: 30 * 1000,
  });
}

export function useSegmentCounts() {
  return useQuery({
    queryKey: ['segment-counts'],
    queryFn: async () => {
      const res = await apiClient.get('/retention-campaigns?action=segments');
      return res.data.data as SegmentCounts;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateWhatsAppCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      segment: string;
      message: string;
      template_name?: string;
      campaign_type?: string;
      scheduled_at?: string | null;
    }) => {
      const res = await apiClient.post('/retention-campaigns?action=create_whatsapp', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useSendCampaignNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const res = await apiClient.post('/retention-campaigns?action=send', { campaign_id: campaignId });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}
