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
      if (!response.ok) throw new Error('Failed to load WhatsApp test status');
      const result = await response.json();
      // 200 com `success: false` é FALHA, não "nenhum teste anterior". Sem esta
      // linha a consulta resolve `null` e a tela mostra "nenhum teste enviado"
      // quando na verdade a busca quebrou — o host lê ausência onde havia erro.
      if (result && result.success === false) {
        throw new Error(result.error || 'Failed to load WhatsApp test status');
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
      // O servidor devolve o registro do teste — aceito, ou o anterior que ainda
      // está em cooldown — nos DOIS desfechos. Gravar na hora, em vez de esperar
      // o `invalidateQueries` do onSettled, é o que faz a tela parar de mostrar
      // o teste ANTIGO como se fosse o resultado do clique que acabou de sair.
      if (payload?.data) queryClient.setQueryData(['whatsappTestStatus'], payload.data);
      // `!response.ok ||` é o conserto: o endpoint devolve 200 com
      // `success: false` quando o provedor recusa a mensagem, e sem isto a
      // mutação RESOLVE — a tela diz "teste enviado" para um envio que nunca
      // saiu. O ramo de erro já existia e carrega cooldown e último teste;
      // só não era alcançado.
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['whatsappTestStatus'] }),
  });
}
