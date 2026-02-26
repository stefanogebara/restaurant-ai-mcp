import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { SETTINGS_STALE_TIME } from '../config/constants';

export interface VoiceEngineSettings {
  voice_engine: 'elevenlabs' | 'openai_realtime';
  voice_engine_status: string;
  openai_voice_id: string;
  elevenlabs_agent_id: string | null;
}

export function useVoiceEngineSettings() {
  return useQuery<VoiceEngineSettings>({
    queryKey: ['voiceEngineSettings'],
    queryFn: async () => {
      const response = await authFetch('/api/voice-engine-settings');
      if (!response.ok) throw new Error('Failed to load voice engine settings');
      const result = await response.json();
      return result.data;
    },
    staleTime: SETTINGS_STALE_TIME,
    retry: 1,
  });
}

export function useSaveVoiceEngine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<Pick<VoiceEngineSettings, 'voice_engine' | 'openai_voice_id' | 'voice_engine_status'>>) => {
      const response = await authFetch('/api/voice-engine-settings', {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['voiceEngineSettings'] }),
  });
}
