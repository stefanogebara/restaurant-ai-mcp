/**
 * Voice Selection Step - Onboarding Step 2.5 - Enhanced with Filters & Pagination
 * Uses shared voice components for consistent experience with VoiceSettingsPage.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { authFetch } from '../../services/api';
import ThiingsIcon from '../common/ThiingsIcon';
import VoiceFilters from '../voice/VoiceFilters';
import VoiceGrid from '../voice/VoiceGrid';
import { getLanguageFromCountry, getPreviewText } from '../voice/voiceConstants';
import type { EnhancedVoice, VoiceFiltersState } from '../voice/voiceTypes';
import type { OnboardingData } from '../../types/onboarding.types';

interface Step2_5Props {
  data: OnboardingData;
  onUpdate: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onPrev: () => void;
}

const PAGE_SIZE = 12;
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel - default voice
const DEFAULT_VOICE_LANGUAGE = 'en';

export default function Step2_5VoiceSelection({ data, onUpdate, onNext, onPrev }: Step2_5Props) {
  const [voices, setVoices] = useState<EnhancedVoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(data.selected_voice_id || '');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const [audioElements, setAudioElements] = useState<Record<string, HTMLAudioElement>>({});
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [voicesSource, setVoicesSource] = useState<string>('');

  const defaultLang = getLanguageFromCountry(data.country || 'United States');
  const [filters, setFilters] = useState<VoiceFiltersState>({
    gender: 'all',
    language: defaultLang,
    search: '',
  });

  // Track previous country to detect changes
  const previousCountryRef = useRef<string>(data.country || '');

  // Reset when country changes
  useEffect(() => {
    const country = data.country || 'United States';
    if (previousCountryRef.current && previousCountryRef.current !== country) {
      const newLang = getLanguageFromCountry(country);
      setFilters(prev => ({ ...prev, language: newLang }));
      setSelectedVoiceId('');
      setPage(0);
      setVoices([]);
      // Clear cached audio
      Object.values(audioElements).forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      setAudioElements({});
      setPlayingVoiceId(null);
      onUpdate({ selected_voice_id: '', selected_voice_language: '' });
    }
    previousCountryRef.current = country;
  }, [data.country]);

  // Fetch voices when filters change
  const fetchVoices = useCallback(async (pageNum: number, append: boolean) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    const country = data.country || 'United States';
    const params = new URLSearchParams({
      country: country,
      language: filters.language,
      page_size: String(PAGE_SIZE),
      page: String(pageNum),
    });
    if (filters.gender !== 'all') params.set('gender', filters.gender);
    if (filters.search) params.set('search', filters.search);

    try {
      const response = await authFetch(`/api/elevenlabs-voices?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch voices');

      const result = await response.json();
      if (result.success && result.data.voices) {
        const newVoices: EnhancedVoice[] = result.data.voices.map((v: EnhancedVoice) => ({
          ...v,
          preview_phrase: getPreviewText(filters.language, data.restaurant_name),
        }));

        if (append) {
          setVoices(prev => [...prev, ...newVoices]);
        } else {
          setVoices(newVoices);
          // Auto-select first voice if none selected
          if (!selectedVoiceId && newVoices.length > 0) {
            const firstVoice = newVoices[0];
            setSelectedVoiceId(firstVoice.id);
            onUpdate({
              selected_voice_id: firstVoice.id,
              selected_voice_language: filters.language,
            });
          }
        }
        setHasMore(result.data.has_more || false);
        setVoicesSource(result.data.source || '');
      } else if (!append) {
        // No voices - use default
        setSelectedVoiceId(DEFAULT_VOICE_ID);
        onUpdate({
          selected_voice_id: DEFAULT_VOICE_ID,
          selected_voice_language: DEFAULT_VOICE_LANGUAGE,
        });
      }
    } catch (error) {
      console.error('Error fetching voices:', error);
      if (!append) {
        setSelectedVoiceId(DEFAULT_VOICE_ID);
        onUpdate({
          selected_voice_id: DEFAULT_VOICE_ID,
          selected_voice_language: DEFAULT_VOICE_LANGUAGE,
        });
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [filters, data.country, data.restaurant_name, selectedVoiceId, onUpdate]);

  // Refetch when filters change (reset page)
  useEffect(() => {
    setPage(0);
    fetchVoices(0, false);
  }, [filters.gender, filters.language, filters.search]);

  // Load more handler
  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchVoices(nextPage, true);
  };

  // Filter change handler
  const handleFiltersChange = (newFilters: VoiceFiltersState) => {
    // If language changed, update the voice language for onboarding
    if (newFilters.language !== filters.language) {
      onUpdate({ selected_voice_language: newFilters.language });
    }
    setFilters(newFilters);
  };

  // Handle voice preview
  const handlePlayVoice = async (voiceId: string, previewText: string) => {
    if (playingVoiceId === voiceId) {
      audioElements[voiceId]?.pause();
      setPlayingVoiceId(null);
      return;
    }

    if (playingVoiceId && audioElements[playingVoiceId]) {
      audioElements[playingVoiceId].pause();
    }

    if (audioElements[voiceId]) {
      audioElements[voiceId].currentTime = 0;
      audioElements[voiceId].play();
      setPlayingVoiceId(voiceId);
      return;
    }

    setLoadingAudio(voiceId);
    try {
      // Try preview_url first (free CDN), fall back to TTS API
      const voice = voices.find(v => v.id === voiceId);
      if (voice?.preview_url) {
        const audio = new Audio(voice.preview_url);
        audio.onended = () => setPlayingVoiceId(null);
        audio.onerror = () => {
          // Fallback to TTS API on preview_url failure
          generatePreviewFromAPI(voiceId, previewText);
        };
        setAudioElements(prev => ({ ...prev, [voiceId]: audio }));
        await audio.play();
        setPlayingVoiceId(voiceId);
        setLoadingAudio(null);
        return;
      }

      await generatePreviewFromAPI(voiceId, previewText);
    } catch (error) {
      console.error('Error playing voice:', error);
      setLoadingAudio(null);
    }
  };

  const generatePreviewFromAPI = async (voiceId: string, previewText: string) => {
    try {
      const response = await authFetch('/api/elevenlabs-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_id: voiceId, text: previewText }),
      });

      if (!response.ok) throw new Error('Failed to generate preview');

      const result = await response.json();
      if (result.success && result.data.audio) {
        const audio = new Audio(result.data.audio);
        audio.onended = () => setPlayingVoiceId(null);
        audio.onerror = () => {
          setPlayingVoiceId(null);
          console.error('Audio playback error');
        };
        setAudioElements(prev => ({ ...prev, [voiceId]: audio }));
        await audio.play();
        setPlayingVoiceId(voiceId);
      }
    } catch (error) {
      console.error('Error generating preview:', error);
    } finally {
      setLoadingAudio(null);
    }
  };

  const handleSelectVoice = (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    const selectedVoice = voices.find(v => v.id === voiceId);
    onUpdate({
      selected_voice_id: voiceId,
      selected_voice_language: selectedVoice?.language || filters.language || 'en',
    });
  };

  const handleContinue = () => {
    if (selectedVoiceId) {
      onUpdate({ selected_voice_id: selectedVoiceId });
      onNext();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-[#9F1239]/10 rounded-full">
            <ThiingsIcon name="volume" pxSize={20} />
          </div>
          <h2 className="font-serif text-2xl font-bold text-[#1C1917]">
            Choose Your AI Voice
          </h2>
        </div>
        <p className="text-sm text-[#57534E]">
          Select the voice that will represent your restaurant when customers call. Click play to preview.
        </p>
      </div>

      {/* Filters */}
      <VoiceFilters
        filters={filters}
        onChange={handleFiltersChange}
        defaultLanguage={defaultLang}
        hideSearch={voicesSource === 'own_voices_fallback'}
      />

      {/* Voice Grid (shows skeleton when loading) */}
      <VoiceGrid
        voices={voices}
        selectedVoiceId={selectedVoiceId}
        playingVoiceId={playingVoiceId}
        loadingAudioId={loadingAudio}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onSelectVoice={handleSelectVoice}
        onPlayVoice={handlePlayVoice}
        onLoadMore={handleLoadMore}
        isLoading={isLoading}
        source={voicesSource}
      />

      {/* No Voices Message */}
      {!isLoading && voices.length === 0 && !filters.search && (
        <div className="text-center py-12">
          <div className="bg-[#9F1239]/5 border border-[#9F1239]/20 rounded-xl p-6 max-w-lg mx-auto">
            <ThiingsIcon name="volume" pxSize={40} className="mx-auto mb-3" />
            <p className="text-base font-semibold text-[#1C1917] mb-1">
              A default voice has been selected
            </p>
            <p className="text-sm text-[#57534E]">
              You can change the voice anytime from your dashboard settings.
            </p>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={onPrev}
          className="px-6 py-3 bg-white hover:bg-[#F5F5F4] border border-[#E7E5E4] text-[#1C1917] font-semibold rounded-xl transition-all flex items-center gap-2"
        >
          <ThiingsIcon name="chevron-left" pxSize={20} />
          Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!selectedVoiceId}
          className="px-8 py-3 bg-[#9F1239] hover:bg-[#881337] text-white font-bold rounded-xl flex items-center gap-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
          <ThiingsIcon name="arrow-right" pxSize={20} />
        </button>
      </div>
    </div>
  );
}
