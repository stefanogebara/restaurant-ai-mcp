import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface WhatsAppProvision {
  estado: 'nao_iniciado' | 'aguardando_codigo' | 'ativo' | 'erro';
  numero_e164?: string;
  metodo?: string;
  erro?: string | null;
}

export function useWhatsAppProvision() {
  return useQuery({
    queryKey: ['whatsapp-provision'],
    queryFn: async (): Promise<WhatsAppProvision> => {
      const response = await authFetch('/api/whatsapp-provision');
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Unable to check connection');
      return result.data;
    },
    staleTime: 30_000,
    retry: 1,
  });
}
