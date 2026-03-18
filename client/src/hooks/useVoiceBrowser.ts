import { useState, useEffect, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';
import { getPreviewText } from '../components/voice/voiceConstants';
import type { EnhancedVoice, VoiceFiltersState } from '../components/voice/voiceTypes';

const PAGE_SIZE = 12;

interface UseVoiceBrowserOptions {
  isOpen: boolean;
  language: string;
  restaurantName?: string;
}

interface VoicePageData {
  voices: EnhancedVoice[];
  has_more: boolean;
  source: string;
}

export function useVoiceBrowser({ isOpen, language, restaurantName }: UseVoiceBrowserOptions) {
  const [filters, setFilters] = useState<VoiceFiltersState>({ gender: 'all', language, search: '' });

  // Sync filter language when language prop changes (state management, not data fetch)
  useEffect(() => {
    setFilters(prev => ({ ...prev, language }));
  }, [language]);

  const voiceQuery = useInfiniteQuery<VoicePageData>({
    queryKey: ['voice-browser', filters.language, filters.gender, filters.search],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        language: filters.language,
        page_size: String(PAGE_SIZE),
        page: String(pageParam as number),
      });
      if (filters.gender !== 'all') params.set('gender', filters.gender);
      if (filters.search) params.set('search', filters.search);

      const response = await authFetch(`/api/elevenlabs-voices?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch voices');
      const result = await response.json();
      if (!result.success) throw new Error('Failed to fetch voices');
      return {
        voices: result.data.voices ?? [],
        has_more: result.data.has_more ?? false,
        source: result.data.source ?? '',
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage.has_more ? allPages.length : undefined,
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const voices = useMemo<EnhancedVoice[]>(
    () => (voiceQuery.data?.pages ?? []).flatMap(page =>
      page.voices.map(v => ({
        ...v,
        preview_phrase: getPreviewText(filters.language, restaurantName),
      }))
    ),
    [voiceQuery.data?.pages, filters.language, restaurantName]
  );

  return {
    voices,
    isLoadingVoices: voiceQuery.isLoading,
    isLoadingMore: voiceQuery.isFetchingNextPage,
    hasMore: voiceQuery.hasNextPage ?? false,
    voicesSource: voiceQuery.data?.pages.at(-1)?.source ?? '',
    error: voiceQuery.error,
    refetch: voiceQuery.refetch,
    filters,
    setFilters,
    handleLoadMore: () => voiceQuery.fetchNextPage(),
  };
}
