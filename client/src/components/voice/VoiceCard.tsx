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
  const genderLabel = voice.gender === 'male' ? t('voiceSettings.filterMale')
    : voice.gender === 'female' ? t('voiceSettings.filterFemale') : t('voiceSettings.unspecifiedGender');
  const languageLabel = voice.language?.toUpperCase() || t('voiceSettings.languageNotSpecified');
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
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
      aria-label={`${voice.name} - ${genderLabel} - ${languageLabel}`}
      className={`
        relative glass-card border-2 p-5 cursor-pointer
        transition-all duration-200 hover:border-burgundy/50
        focus:outline-none focus:ring-2 focus:ring-burgundy focus:ring-offset-2
        ${isSelected
          ? 'border-deep-charcoal bg-soft-gray'
          : 'border-glass-border-dark hover:border-burgundy/50'
        }
      `}
    >
      {/* Selected Checkmark */}
      {isSelected && (
        <div className="absolute top-3 right-3 text-deep-charcoal">
          <ThiingsIcon name="check-circle" pxSize={22} />
        </div>
      )}

      {/* Voice Info */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-sans text-[15px] font-semibold text-deep-charcoal line-clamp-2 break-words pr-6" title={voice.name}>
            {voice.name}
          </h3>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-soft-gray text-stone-gray">
            {languageLabel}
          </span>
          {voice.accent && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-soft-gray text-stone-gray">
              {voice.accent}
            </span>
          )}
          {voice.gender && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-soft-gray text-stone-gray">
              {genderLabel}
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
        type="button"
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
