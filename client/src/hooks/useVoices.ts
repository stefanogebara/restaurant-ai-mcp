import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import type { EnhancedVoice, VoiceFiltersState } from '../components/voice/voiceTypes';

interface VoicesResponse {
  voices: EnhancedVoice[];
  has_more: boolean;
  page: number;
  page_size: number;
  source: string;
}

export function useVoices(filters: VoiceFiltersState, page: number, pageSize = 12, enabled = true) {
  return useQuery<VoicesResponse>({
    queryKey: ['voices', filters.language, filters.gender, filters.search, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        language: filters.language,
        page_size: String(pageSize),
        page: String(page),
      });
      if (filters.gender !== 'all') params.set('gender', filters.gender);
      if (filters.search) params.set('search', filters.search);

      const response = await authFetch(`/api/elevenlabs-voices?${params}`);
      if (!response.ok) throw new Error('Failed to fetch voices');
      const result = await response.json();
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}
