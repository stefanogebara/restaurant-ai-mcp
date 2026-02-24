/**
 * Scrollable voice grid with pagination, skeleton loading, and keyboard navigation.
 */

import { useState, useRef, useCallback } from 'react';
import VoiceCard from './VoiceCard';
import VoiceCardSkeleton from './VoiceCardSkeleton';
import type { EnhancedVoice } from './voiceTypes';
import ThiingsIcon from '../common/ThiingsIcon';

interface VoiceGridProps {
  voices: EnhancedVoice[];
  selectedVoiceId: string;
  playingVoiceId: string | null;
  loadingAudioId: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  onSelectVoice: (voiceId: string) => void;
  onPlayVoice: (voiceId: string, previewText: string) => void;
  onLoadMore: () => void;
  isLoading?: boolean;
  source?: string;
}

export default function VoiceGrid({
  voices,
  selectedVoiceId,
  playingVoiceId,
  loadingAudioId,
  hasMore,
  isLoadingMore,
  onSelectVoice,
  onPlayVoice,
  onLoadMore,
  isLoading = false,
  source,
}: VoiceGridProps) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (voices.length === 0) return;

      let nextIndex = focusedIndex;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          nextIndex = focusedIndex < voices.length - 1 ? focusedIndex + 1 : 0;
          break;
        case 'ArrowLeft':
          e.preventDefault();
          nextIndex = focusedIndex > 0 ? focusedIndex - 1 : voices.length - 1;
          break;
        case 'ArrowDown':
          e.preventDefault();
          nextIndex = Math.min(focusedIndex + 3, voices.length - 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          nextIndex = Math.max(focusedIndex - 3, 0);
          break;
        default:
          return;
      }

      setFocusedIndex(nextIndex);
      cardRefs.current[nextIndex]?.focus();
    },
    [focusedIndex, voices.length],
  );

  if (isLoading) {
    return (
      <div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" role="status" aria-label="Loading voices">
          {Array.from({ length: 6 }).map((_, i) => (
            <VoiceCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (voices.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="w-14 h-14 mx-auto mb-3 bg-soft-gray rounded-2xl flex items-center justify-center">
          <ThiingsIcon name="search" pxSize={24} />
        </div>
        <p className="text-sm font-semibold text-deep-charcoal">No voices found</p>
        <p className="text-xs text-stone-gray mt-1">Try adjusting your search or filters.</p>
      </div>
    );
  }

  return (
    <div>
      {source === 'own_voices_fallback' && (
        <p className="text-xs text-stone-gray bg-soft-gray rounded-xl px-3 py-2 mb-3">
          Showing curated voices. Contact support to unlock the full voice library.
        </p>
      )}

      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[520px] overflow-y-auto pr-1"
        role="radiogroup"
        aria-label="Available voices"
        onKeyDown={handleGridKeyDown}
      >
        {voices.map((voice, index) => (
          <VoiceCard
            key={voice.id}
            ref={(el) => { cardRefs.current[index] = el; }}
            voice={voice}
            isSelected={selectedVoiceId === voice.id}
            isPlaying={playingVoiceId === voice.id}
            isLoading={loadingAudioId === voice.id}
            onSelect={(id) => {
              setFocusedIndex(index);
              onSelectVoice(id);
            }}
            onPlay={onPlayVoice}
          />
        ))}
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="px-6 py-2.5 text-sm font-medium text-burgundy bg-burgundy/5 hover:bg-burgundy/10 rounded-xl transition-colors disabled:opacity-50"
          >
            {isLoadingMore ? 'Loading more voices...' : 'Show more voices'}
          </button>
        </div>
      )}
    </div>
  );
}
