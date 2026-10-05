import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { SETTINGS_STALE_TIME } from '../config/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PhoneIntegrationStatus {
  success: boolean;
  restaurant: {
    name: string;
    has_agent: boolean;
    agent_id: string | null;
    phone_number: string | null;
    status: 'active' | 'not_configured' | 'error' | 'unavailable' | 'unknown';
    error: string | null;
    configured_at: string | null;
  };
  platform: {
    twilio_phone: string | null;
    line_availability?: 'available' | 'owned_by_this_restaurant' | 'unavailable' | 'unknown';
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePhoneIntegration() {
  const statusQuery = useQuery({
    queryKey: ['phone-integration-status'],
    queryFn: async (): Promise<PhoneIntegrationStatus> => {
      const res = await authFetch('/api/phone-integration-simple?action=status');
      if (!res.ok) throw new Error('Falha ao carregar status do telefone');
      return res.json();
    },
    staleTime: SETTINGS_STALE_TIME,
  });

  return {
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    isError: statusQuery.isError,
  };
}
