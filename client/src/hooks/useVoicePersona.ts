import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface VoicePersona {
  agent_name: string | null;
  agent_greeting: string | null;
}

async function fetchPersona(): Promise<VoicePersona> {
  const res = await authFetch('/voice-persona');
  if (!res.ok) throw new Error('Failed to load voice persona');
  return res.json() as Promise<VoicePersona>;
}

async function patchPersona(updates: Partial<VoicePersona>): Promise<VoicePersona> {
  const res = await authFetch('/voice-persona', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to save voice persona');
  return res.json() as Promise<VoicePersona>;
}

export function useVoicePersona() {
  return useQuery({ queryKey: ['voice-persona'], queryFn: fetchPersona, staleTime: 10 * 60 * 1000 });
}

export function useSaveVoicePersona() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchPersona,
    onSuccess: (updated) => { queryClient.setQueryData(['voice-persona'], updated); },
  });
}
