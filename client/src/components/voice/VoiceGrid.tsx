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
        <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2" role="status" aria-label="Loading voices">
          {Array.from({ length: 6 }).map((_, i) => (
            <VoiceCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (voices.length === 0) {
    return (
      <div className="border-y border-brand-line py-8 text-center font-brand">
        <ThiingsIcon name="search" pxSize={22} />
        <p className="mt-2 text-sm font-semibold text-brand-ink">No voices found</p>
        <p className="mt-1 text-xs text-brand-muted">Try adjusting your search or filters.</p>
      </div>
    );
  }

  return (
    <div>
      {source === 'own_voices_fallback' && (
        <p className="mb-3 border-l-2 border-amber-700 pl-3 text-xs text-amber-900">
          Showing curated voices. Contact support to unlock the full voice library.
        </p>
      )}

      <div
        className="grid max-h-[520px] grid-cols-1 gap-x-8 overflow-y-auto pr-1 md:grid-cols-2"
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
            className="min-h-10 text-sm font-medium text-brand-action underline underline-offset-4 hover:text-brand-ink disabled:opacity-50"
          >
            {isLoadingMore ? 'Loading more voices...' : 'Show more voices'}
          </button>
        </div>
      )}
    </div>
  );
}
