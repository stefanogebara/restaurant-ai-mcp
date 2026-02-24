/**
 * Individual voice card with name, tags, description, play button, and selection state.
 * Supports keyboard navigation: Enter/Space to select, focus ring for visibility.
 */

import { forwardRef, useCallback } from 'react';
import ThiingsIcon from '../common/ThiingsIcon';
import Spinner from '../common/Spinner';
import type { EnhancedVoice } from './voiceTypes';

interface VoiceCardProps {
  voice: EnhancedVoice;
  isSelected: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  onSelect: (voiceId: string) => void;
  onPlay: (voiceId: string, previewText: string) => void;
}

const VoiceCard = forwardRef<HTMLDivElement, VoiceCardProps>(function VoiceCard(
  { voice, isSelected, isPlaying, isLoading, onSelect, onPlay },
  ref,
) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(voice.id);
      }
    },
    [voice.id, onSelect],
  );

  return (
    <div
      ref={ref}
      onClick={() => onSelect(voice.id)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="radio"
      aria-checked={isSelected}
      aria-label={`${voice.name} - ${voice.gender || 'neutral'} - ${voice.language?.toUpperCase() || 'EN'}`}
      className={`
        relative bg-white border-2 rounded-2xl p-5 cursor-pointer
        transition-all duration-200 hover:shadow-lg
        focus:outline-none focus:ring-2 focus:ring-burgundy focus:ring-offset-2
        ${isSelected
          ? 'border-burgundy shadow-md bg-burgundy/5'
          : 'border-border-gray hover:border-burgundy/50'
        }
      `}
    >
      {/* Selected Checkmark */}
      {isSelected && (
        <div className="absolute top-3 right-3 text-burgundy">
          <ThiingsIcon name="check-circle" pxSize={22} />
        </div>
      )}

      {/* Voice Info */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-bold text-deep-charcoal truncate pr-6">
            {voice.name}
          </h3>
          <span className="text-xs capitalize text-stone-gray">
            {voice.gender === 'male' ? '\u2642' : voice.gender === 'female' ? '\u2640' : ''}
          </span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-burgundy/10 text-burgundy">
            {voice.language?.toUpperCase() || 'EN'}
          </span>
          {voice.accent && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-700">
              {voice.accent}
            </span>
          )}
          {voice.category && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-soft-gray text-stone-gray">
              {voice.category}
            </span>
          )}
        </div>

        {/* Description */}
        {voice.description && (
          <p className="text-xs text-warm-stone line-clamp-2">
            {voice.description}
          </p>
        )}
      </div>

      {/* Play Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPlay(voice.id, voice.preview_phrase);
        }}
        disabled={isLoading}
        className={`
          w-full py-2.5 px-4 rounded-xl font-semibold text-sm transition-all
          flex items-center justify-center gap-2
          ${isPlaying
            ? 'bg-burgundy text-white hover:bg-burgundy-dark'
            : 'bg-soft-gray hover:bg-border-gray text-deep-charcoal'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {isLoading ? (
          <>
            <Spinner size="sm" />
            <span>Loading...</span>
          </>
        ) : isPlaying ? (
          <>
            <ThiingsIcon name="pause" pxSize={18} />
            <span>Pause</span>
          </>
        ) : (
          <>
            <ThiingsIcon name="play" pxSize={18} />
            <span>Preview</span>
          </>
        )}
      </button>
    </div>
  );
});

export default VoiceCard;
