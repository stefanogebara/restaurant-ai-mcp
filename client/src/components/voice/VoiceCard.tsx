/**
 * Individual voice card with name, tags, description, play button, and selection state.
 * Supports keyboard navigation: Enter/Space to select, focus ring for visibility.
 */

import { forwardRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        relative min-h-36 cursor-pointer border-b border-l-2 border-brand-line py-4 pl-4 pr-3 font-brand
        transition-colors hover:bg-brand-action/5
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action
        ${isSelected
          ? 'border-l-brand-action bg-brand-action/5'
          : 'border-l-transparent'
        }
      `}
    >
      {isSelected && (
        <div className="absolute right-3 top-4 text-brand-action">
          <ThiingsIcon name="check-circle" pxSize={18} />
        </div>
      )}

      <div className="mb-3">
        <div className="mb-1 flex items-center gap-2">
          <h3 className="truncate pr-6 font-brand text-[16px] font-medium text-brand-ink">
            {voice.name}
          </h3>
        </div>
        <p className="text-[12px] text-brand-muted">
          {[voice.language?.toUpperCase() || 'EN', voice.accent, voice.category].filter(Boolean).join(' · ')}
        </p>
        {voice.description && (
          <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-brand-muted">
            {voice.description}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPlay(voice.id, voice.preview_phrase);
        }}
        disabled={isLoading}
        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-brand-line px-4 text-[13px] font-medium text-brand-ink hover:border-brand-action disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
      >
        {isLoading ? (
          <>
            <Spinner size="sm" />
            <span>{t('common.loadingText')}</span>
          </>
        ) : isPlaying ? (
          <>
            <ThiingsIcon name="pause" pxSize={18} />
            <span>{t('common.pause')}</span>
          </>
        ) : (
          <>
            <ThiingsIcon name="play" pxSize={18} />
            <span>{t('common.preview')}</span>
          </>
        )}
      </button>
    </div>
  );
});

export default VoiceCard;
