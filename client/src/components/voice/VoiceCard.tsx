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
        relative bg-white border-2 rounded-xl p-5 cursor-pointer
        transition-all duration-200 hover:shadow-lg
        focus:outline-none focus:ring-2 focus:ring-[#9F1239] focus:ring-offset-2
        ${isSelected
          ? 'border-[#9F1239] shadow-md bg-[#9F1239]/5'
          : 'border-[#E7E5E4] hover:border-[#9F1239]/50'
        }
      `}
    >
      {/* Selected Checkmark */}
      {isSelected && (
        <div className="absolute top-3 right-3 text-[#9F1239]">
          <ThiingsIcon name="check-circle" pxSize={22} />
        </div>
      )}

      {/* Voice Info */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-bold text-[#1C1917] truncate pr-6">
            {voice.name}
          </h3>
          <span className="text-xs capitalize text-[#57534E]">
            {voice.gender === 'male' ? '\u2642' : voice.gender === 'female' ? '\u2640' : ''}
          </span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#9F1239]/10 text-[#9F1239]">
            {voice.language?.toUpperCase() || 'EN'}
          </span>
          {voice.accent && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
              {voice.accent}
            </span>
          )}
          {voice.category && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#F5F5F4] text-[#57534E]">
              {voice.category}
            </span>
          )}
        </div>

        {/* Description */}
        {voice.description && (
          <p className="text-xs text-[#78716C] line-clamp-2">
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
          w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all
          flex items-center justify-center gap-2
          ${isPlaying
            ? 'bg-[#9F1239] text-white hover:bg-[#881337]'
            : 'bg-[#F5F5F4] hover:bg-[#E7E5E4] text-[#1C1917]'
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
