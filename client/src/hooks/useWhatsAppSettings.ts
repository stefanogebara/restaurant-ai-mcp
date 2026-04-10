import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { SETTINGS_STALE_TIME } from '../config/constants';

export interface WhatsAppIntegrationStatus {
  meta: {
    configured: boolean;
    approved: boolean;
    phone_number: string | null;
    display_name: string | null;
    quality_rating: string | null;
    error: string | null;
  };
  twilio: {
    configured: boolean;
  };
}

interface WhatsAppIntegrationStatusQueryOptions {
  enabled?: boolean;
}

export function useWhatsAppIntegrationStatus(options: WhatsAppIntegrationStatusQueryOptions = {}) {
  const { enabled = true } = options;

  return useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async (): Promise<WhatsAppIntegrationStatus> => {
      const response = await authFetch('/api/whatsapp-status');
      if (!response.ok) throw new Error('Failed to load WhatsApp integration status');
      return response.json();
    },
    enabled,
    staleTime: SETTINGS_STALE_TIME,
  });
}

interface WhatsAppStatus {
  enabled: boolean;
  phone_number: string | null;
  restaurant_name: string;
  api_configured: boolean;
  wa_me_link: string | null;
  display_phone: string;
}

interface WhatsAppStats {
  active_sessions: number;
  total_sessions: number;
  messages_this_month: number;
}

export function useWhatsAppStatus() {
  return useQuery({
    queryKey: ['whatsappStatus'],
    queryFn: async (): Promise<WhatsAppStatus> => {
      const response = await authFetch('/api/whatsapp-settings?action=status');
      if (!response.ok) throw new Error('Failed to load WhatsApp status');
      const result = await response.json();
      return result.data;
    },
    staleTime: SETTINGS_STALE_TIME,
  });
}

export function useWhatsAppStats() {
  return useQuery({
    queryKey: ['whatsappStats'],
    queryFn: async (): Promise<WhatsAppStats> => {
      const response = await authFetch('/api/whatsapp-settings?action=stats');
      if (!response.ok) throw new Error('Failed to load WhatsApp stats');
      const result = await response.json();
      return result.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useSaveWhatsAppSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { enabled?: boolean; phone_number?: string }) => {
      const response = await authFetch('/api/whatsapp-settings?action=update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to save');
      }
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsappStatus'] }),
  });
}

export function useSendTestMessage() {
  return useMutation({
    mutationFn: async (phone_number: string) => {
      const response = await authFetch('/api/whatsapp-settings?action=test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to send test message');
      }
      return response.json();
    },
  });
}
