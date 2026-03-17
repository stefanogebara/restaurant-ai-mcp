import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';

interface VariantConfig {
  agent_name?: string;
  agent_greeting?: string;
  speed?: number;
  voice_id?: string;
}

export interface VoiceExperiment {
  id: string;
  restaurant_id: string;
  status: 'draft' | 'running' | 'completed' | 'promoted';
  branch_id: string | null;
  branch_name: string;
  variant_config: VariantConfig;
  traffic_split: number;
  control_count?: number;
  variant_count?: number;
  started_at: string | null;
  completed_at: string | null;
  result: { winner?: string } | null;
  created_at: string;
}

async function fetchCurrentExperiment(): Promise<VoiceExperiment | null> {
  const res = await authFetch('/api/voice-experiments?action=current');
  if (!res.ok) throw new Error('Failed to load experiment');
  const data = await res.json();
  return (data.experiment as VoiceExperiment) ?? null;
}

export function useVoiceExperiment() {
  return useQuery({
    queryKey: ['voiceExperiment'],
    queryFn: fetchCurrentExperiment,
    staleTime: 30_000,
  });
}

export function useCreateExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      branch_name: string;
      variant_config: VariantConfig;
      traffic_split?: number;
    }) => {
      const res = await authFetch('/api/voice-experiments?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Failed to create experiment');
      const data = await res.json();
      return data.experiment as VoiceExperiment;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voiceExperiment'] }),
  });
}

export function usePromoteExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/voice-experiments?action=promote', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to promote experiment');
      const data = await res.json();
      return data.experiment as VoiceExperiment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voiceExperiment'] });
      qc.invalidateQueries({ queryKey: ['voice-persona'] });
    },
  });
}

export function useRollbackExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await authFetch('/api/voice-experiments?action=rollback', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to roll back experiment');
      const data = await res.json();
      return data.experiment as VoiceExperiment;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voiceExperiment'] }),
  });
}
