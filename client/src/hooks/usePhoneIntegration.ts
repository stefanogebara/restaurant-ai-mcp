import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { SETTINGS_STALE_TIME } from '../config/constants';

export interface PhoneIntegrationStatus {
  success: boolean;
  restaurant: {
    name: string;
    has_agent: boolean;
    agent_id: string | null;
    phone_number: null;
    status: 'needs_review' | 'not_configured' | 'pending' | 'error';
    error: string | null;
    configured_at: string | null;
  };
  platform: {
    activation_mode: 'assisted';
    routing_verified: false;
  };
}

/** Read-only until a restaurant-specific voice route can be proven. */
export function usePhoneIntegration() {
  const query = useQuery({
    queryKey: ['phone-integration-status'],
    queryFn: async (): Promise<PhoneIntegrationStatus> => {
      const res = await authFetch('/api/phone-integration-simple?action=status');
      if (!res.ok) throw new Error('Phone status unavailable');
      return res.json();
    },
    staleTime: SETTINGS_STALE_TIME,
  });

  return {
    status: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
