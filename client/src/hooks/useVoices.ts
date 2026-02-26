import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { SETTINGS_STALE_TIME } from '../config/constants';
import type { EnhancedVoice, VoiceFiltersState } from '../components/voice/voiceTypes';

interface VoicesResponse {
  voices: EnhancedVoice[];
  has_more: boolean;
  page: number;
  page_size: number;
  source: string;
}

interface VoicePageData {
  voices: EnhancedVoice[];
  has_more: boolean;
  source: string;
}

export function useVoiceListInfinite(
  filters: VoiceFiltersState,
  country: string,
  pageSize = 12,
) {
  return useInfiniteQuery<VoicePageData>({
    queryKey: ['voices-infinite', filters.language, filters.gender, filters.search, country],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        country,
        language: filters.language,
        page_size: String(pageSize),
        page: String(pageParam as number),
      });
      if (filters.gender !== 'all') params.set('gender', filters.gender);
      if (filters.search) params.set('search', filters.search);

      const response = await authFetch(`/api/elevenlabs-voices?${params}`);
      if (!response.ok) throw new Error('Failed to fetch voices');
      const result = await response.json();
      return {
        voices: result.success ? (result.data.voices || []) : [],
        has_more: result.data?.has_more || false,
        source: result.data?.source || '',
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage.has_more ? allPages.length : undefined,
    staleTime: SETTINGS_STALE_TIME,
  });
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
    staleTime: SETTINGS_STALE_TIME,
    enabled,
  });
}
