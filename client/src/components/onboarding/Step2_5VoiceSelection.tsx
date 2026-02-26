/**
 * Voice Selection Step - Onboarding Step 2.5 - Enhanced with Filters & Pagination
 * Uses shared voice components for consistent experience with VoiceSettingsPage.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { authFetch } from '../../services/api';
import ThiingsIcon from '../common/ThiingsIcon';
import VoiceFilters from '../voice/VoiceFilters';
import VoiceGrid from '../voice/VoiceGrid';
import { getLanguageFromCountry, getPreviewText } from '../voice/voiceConstants';
import { useVoiceListInfinite } from '../../hooks/useVoices';
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
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(data.selected_voice_id || '');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const [audioElements, setAudioElements] = useState<Record<string, HTMLAudioElement>>({});

  const defaultLang = getLanguageFromCountry(data.country || 'United States');
  const [filters, setFilters] = useState<VoiceFiltersState>({
    gender: 'all',
    language: defaultLang,
    search: '',
  });

  const previousCountryRef = useRef<string>(data.country || '');

  const country = data.country || 'United States';

  const voiceQuery = useVoiceListInfinite(filters, country, PAGE_SIZE);

  // Flatten all pages + inject preview phrases
  const voices = useMemo<EnhancedVoice[]>(
    () => (voiceQuery.data?.pages ?? []).flatMap(page =>
      page.voices.map(v => ({ ...v, preview_phrase: getPreviewText(filters.language, data.restaurant_name) }))
    ),
    [voiceQuery.data?.pages, filters.language, data.restaurant_name]
  );

  const voicesSource = voiceQuery.data?.pages.at(-1)?.source ?? '';
  const hasMore = voiceQuery.hasNextPage ?? false;

  // Auto-select first voice when results load (only if nothing selected)
  const firstVoiceId = voiceQuery.data?.pages[0]?.voices[0]?.id;
  useEffect(() => {
    if (selectedVoiceId || voiceQuery.isLoading) return;
    if (firstVoiceId) {
      setSelectedVoiceId(firstVoiceId);
      onUpdate({ selected_voice_id: firstVoiceId, selected_voice_language: filters.language });
    } else if (!voiceQuery.isFetching && voiceQuery.data) {
      setSelectedVoiceId(DEFAULT_VOICE_ID);
      onUpdate({ selected_voice_id: DEFAULT_VOICE_ID, selected_voice_language: DEFAULT_VOICE_LANGUAGE });
    }
  }, [firstVoiceId, voiceQuery.isLoading, voiceQuery.isFetching]);

  // Reset when country changes
  useEffect(() => {
    if (previousCountryRef.current && previousCountryRef.current !== country) {
      const newLang = getLanguageFromCountry(country);
      setFilters(prev => ({ ...prev, language: newLang }));
      setSelectedVoiceId('');
      Object.values(audioElements).forEach(audio => { audio.pause(); audio.src = ''; });
      setAudioElements({});
      setPlayingVoiceId(null);
      onUpdate({ selected_voice_id: '', selected_voice_language: '' });
    }
    previousCountryRef.current = country;
  }, [country]);

  const handleFiltersChange = (newFilters: VoiceFiltersState) => {
    if (newFilters.language !== filters.language) {
      onUpdate({ selected_voice_language: newFilters.language });
    }
    setFilters(newFilters);
  };

  const handleLoadMore = () => {
    voiceQuery.fetchNextPage();
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
      const voice = voices.find(v => v.id === voiceId);
      if (voice?.preview_url) {
        const audio = new Audio(voice.preview_url);
        audio.onended = () => setPlayingVoiceId(null);
        audio.onerror = () => { generatePreviewFromAPI(voiceId, previewText); };
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
        audio.onerror = () => { setPlayingVoiceId(null); };
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
          <div className="inline-flex items-center justify-center w-10 h-10 bg-burgundy/10 rounded-full">
            <ThiingsIcon name="volume" pxSize={20} />
          </div>
          <h2 className="font-serif text-2xl font-bold text-deep-charcoal">
            Choose Your AI Voice
          </h2>
        </div>
        <p className="text-sm text-stone-gray">
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
        isLoadingMore={voiceQuery.isFetchingNextPage}
        onSelectVoice={handleSelectVoice}
        onPlayVoice={handlePlayVoice}
        onLoadMore={handleLoadMore}
        isLoading={voiceQuery.isLoading}
        source={voicesSource}
      />

      {/* No Voices Message */}
      {!voiceQuery.isLoading && voices.length === 0 && !filters.search && (
        <div className="text-center py-12">
          <div className="bg-burgundy/5 border border-burgundy/20 rounded-2xl p-6 max-w-lg mx-auto">
            <ThiingsIcon name="volume" pxSize={40} className="mx-auto mb-3" />
            <p className="text-base font-semibold text-deep-charcoal mb-1">
              A default voice has been selected
            </p>
            <p className="text-sm text-stone-gray">
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
          className="px-6 py-3 bg-white hover:bg-soft-gray border border-border-gray text-deep-charcoal font-semibold rounded-xl transition-all flex items-center gap-2"
        >
          <ThiingsIcon name="chevron-left" pxSize={20} />
          Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!selectedVoiceId}
          className="px-8 py-3 bg-burgundy hover:bg-burgundy-dark text-white font-bold rounded-xl flex items-center gap-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
          <ThiingsIcon name="arrow-right" pxSize={20} />
        </button>
      </div>
    </div>
  );
}
