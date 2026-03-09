import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
    status: 'active' | 'not_configured' | 'error';
    error: string | null;
    configured_at: string | null;
  };
  platform: {
    twilio_phone: string;
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePhoneIntegration() {
  const queryClient = useQueryClient();
  const [testNumber, setTestNumber] = useState('');

  const statusQuery = useQuery({
    queryKey: ['phone-integration-status'],
    queryFn: async (): Promise<PhoneIntegrationStatus> => {
      const res = await authFetch('/api/phone-integration-simple?action=status');
      if (!res.ok) throw new Error('Falha ao carregar status do telefone');
      return res.json();
    },
    staleTime: SETTINGS_STALE_TIME,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['phone-integration-status'] });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/phone-integration-simple?action=register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao conectar telefone');
      return data;
    },
    onSuccess: invalidate,
  });

  const unregisterMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/phone-integration-simple?action=unregister', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao desconectar telefone');
      return data;
    },
    onSuccess: invalidate,
  });

  const testCallMutation = useMutation({
    mutationFn: async (toNumber: string) => {
      const res = await authFetch('/api/phone-integration-simple?action=test-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_number: toNumber }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao fazer chamada de teste');
      return data;
    },
  });

  const isMutating =
    registerMutation.isPending || unregisterMutation.isPending || testCallMutation.isPending;

  return {
    // Status query
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    isError: statusQuery.isError,

    // Mutations
    register: registerMutation.mutate,
    unregister: unregisterMutation.mutate,
    sendTestCall: (toNumber: string) => testCallMutation.mutate(toNumber),

    // Mutation states
    isRegistering: registerMutation.isPending,
    isUnregistering: unregisterMutation.isPending,
    isTestingCall: testCallMutation.isPending,
    isMutating,

    // Test call number state
    testNumber,
    setTestNumber,
  };
}
