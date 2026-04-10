import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { SETTINGS_STALE_TIME } from '../config/constants';

interface VoiceSettingsQueryOptions {
  enabled?: boolean;
}

export function useVoiceSettings(options: VoiceSettingsQueryOptions = {}) {
  const { enabled = true } = options;

  return useQuery({
    queryKey: ['voiceSettings'],
    queryFn: async () => {
      const response = await authFetch('/api/elevenlabs-voice-settings');
      if (!response.ok) throw new Error('Failed to load voice settings');
      const result = await response.json();
      return result.data;
    },
    enabled,
    staleTime: SETTINGS_STALE_TIME,
  });
}

export function useSaveVoiceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const response = await authFetch('/api/elevenlabs-voice-settings', {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['voiceSettings'] }),
  });
}
