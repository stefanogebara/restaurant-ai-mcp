import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { SETTINGS_STALE_TIME } from '../config/constants';

interface VoiceSettingsQueryOptions {
  enabled?: boolean;
}

export class VoiceSettingsPartialSaveError extends Error {
  constructor() {
    super('Voice agent updated, but Seatable could not save its local settings');
    this.name = 'VoiceSettingsPartialSaveError';
  }
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
        const errorBody = await response.json().catch(() => ({}));
        if (errorBody?.partial === true) throw new VoiceSettingsPartialSaveError();
        throw new Error('Failed to save voice settings');
      }
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['voiceSettings'] }),
    onError: (error) => {
      // The remote agent changed even though the local write failed. Refresh
      // readback without discarding the user's pending edits in the page.
      if (error instanceof VoiceSettingsPartialSaveError) {
        queryClient.invalidateQueries({ queryKey: ['voiceSettings'] });
      }
    },
  });
}
