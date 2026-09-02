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

export interface WhatsAppTestMessageStatus {
  id: string;
  provider: string;
  recipient_phone: string;
  template_name: string | null;
  template_language: string | null;
  whatsapp_message_id: string;
  status: string;
  error_message: string | null;
  requested_at: string;
  status_updated_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  cooldown_remaining_ms: number;
  cooldown_active: boolean;
  cooldown_expires_at: string | null;
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

export function useWhatsAppTestMessageStatus() {
  return useQuery({
    queryKey: ['whatsappTestStatus'],
    queryFn: async (): Promise<WhatsAppTestMessageStatus | null> => {
      const response = await authFetch('/api/whatsapp-settings?action=test_status');
      const result = await response.json();
      // 200 com success:false NÃO é "nunca houve teste" — é falha de leitura.
      // Antes os dois viravam null, e o painel dizia "nenhum teste ainda" para
      // um dono cuja consulta tinha quebrado. Silêncio indistinguível de
      // resposta é a pior forma de erro num painel.
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || 'Failed to load WhatsApp test status');
      }
      return result.data ?? null;
    },
    staleTime: 5 * 1000,
    refetchInterval: 15 * 1000,
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
      // Ler o corpo ANTES de decidir: o endpoint devolve falha dentro de um 200,
      // e checar só response.ok fazia o painel dizer "salvo" sem ter salvo.
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Failed to save');
      }
      return payload;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsappStatus'] }),
  });
}

export function useSendTestMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (phone_number: string) => {
      const response = await authFetch('/api/whatsapp-settings?action=test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        const error = new Error(payload.error || 'Failed to send test message') as Error & {
          cooldownRemainingMs?: number;
          latestTestMessage?: WhatsAppTestMessageStatus | null;
        };
        error.cooldownRemainingMs = payload.cooldown_remaining_ms;
        error.latestTestMessage = payload.data ?? null;
        throw error;
      }
      return payload;
    },
    // O servidor já devolve o registro do teste — no sucesso E na recusa por
    // cooldown. Gravar direto em vez de só invalidar: a invalidação depende de
    // um refetch chegar, e até ele chegar o painel mostra o teste ANTERIOR como
    // se fosse o atual. Aqui isso significaria dizer "entregue" sobre uma
    // mensagem que acabou de ser aceita, ou esconder o cooldown que o próprio
    // servidor acabou de informar.
    onSuccess: (payload) => {
      if (payload?.data) queryClient.setQueryData(['whatsappTestStatus'], payload.data);
    },
    onError: (error: Error & { latestTestMessage?: WhatsAppTestMessageStatus | null }) => {
      if (error?.latestTestMessage) {
        queryClient.setQueryData(['whatsappTestStatus'], error.latestTestMessage);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['whatsappTestStatus'] }),
  });
}
