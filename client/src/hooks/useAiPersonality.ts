import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface AiPersonality {
  humor_type: 'none' | 'light' | 'witty' | 'warm' | 'playful';
  personality_traits: string[];
  communication_style: 'formal' | 'casual' | 'friendly_professional';
  verbal_quirks: string;
  language_tone: 'enthusiastic' | 'calm' | 'neutral' | 'warm';
}

async function fetchPersonality(): Promise<AiPersonality> {
  const res = await authFetch('/api/ai-personality');
  if (!res.ok) throw new Error('Failed to load AI personality');
  return res.json() as Promise<AiPersonality>;
}

async function patchPersonality(updates: Partial<AiPersonality>): Promise<AiPersonality> {
  const res = await authFetch('/api/ai-personality', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to save AI personality');
  return res.json() as Promise<AiPersonality>;
}

export function useAiPersonality() {
  return useQuery({ queryKey: ['ai-personality'], queryFn: fetchPersonality, staleTime: 10 * 60 * 1000 });
}

export function useSaveAiPersonality() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchPersonality,
    onSuccess: (updated) => { queryClient.setQueryData(['ai-personality'], updated); },
  });
}
