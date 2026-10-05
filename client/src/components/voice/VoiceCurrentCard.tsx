import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import Spinner from '../common/Spinner';
import { getPreviewText } from './voiceConstants';
import type { EnhancedVoice } from './voiceTypes';

interface Props {
  currentVoiceId: string;
  pendingVoiceId: string | null;
  selectedBrowserVoice: EnhancedVoice | undefined;
  savedVoiceName: string | undefined;
  savedVoiceId: string | undefined;
  currentLanguage: string;
  restaurantName: string | undefined;
  isBrowserOpen: boolean;
  loadingAudio: string | null;
  playingVoiceId: string | null;
  onPlay: (voiceId: string, previewText: string) => void;
  onToggleBrowser: () => void;
}

export default function VoiceCurrentCard({
  currentVoiceId,
  pendingVoiceId,
  selectedBrowserVoice,
  savedVoiceName,
  savedVoiceId,
  currentLanguage,
  restaurantName,
  isBrowserOpen,
  loadingAudio,
  playingVoiceId,
  onPlay,
  onToggleBrowser,
}: Props) {
  const { t, i18n } = useTranslation();
  const languageName = new Intl.DisplayNames([i18n.language || 'en'], { type: 'language' }).of(currentLanguage)
    || currentLanguage.toUpperCase();

  return (
    <section className="overflow-hidden border-b border-brand-line pb-6">
      <div className="py-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted">{t('voiceCurrentCard.chooseAVoice', 'Choose a Voice')}</span>
      </div>

      <div className="pt-1">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="font-brand text-[22px] font-medium tracking-[-0.035em] text-brand-ink">
              {pendingVoiceId ? (
                <span>
                  {selectedBrowserVoice?.name || pendingVoiceId}
                  <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-600/10 px-2 py-0.5 rounded-full">
                    {t('voiceCurrentCard.pending', 'pending')}
                  </span>
                </span>
              ) : (
                savedVoiceName || (savedVoiceId ? t('voiceCurrentCard.customVoice', 'Custom Voice') : t('voiceCurrentCard.noVoiceSet', 'No voice set'))
              )}
            </p>
            <div className="mt-1 flex items-center gap-3 text-sm text-brand-muted">
              {selectedBrowserVoice?.gender && (
                <>
                  <span className="capitalize">{selectedBrowserVoice.gender}</span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span>{languageName}</span>
              {selectedBrowserVoice?.accent && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{selectedBrowserVoice.accent}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentVoiceId && (
              <button
                type="button"
                onClick={() => onPlay(currentVoiceId, getPreviewText(currentLanguage, restaurantName))}
                disabled={loadingAudio === currentVoiceId}
                className="flex items-center gap-2 rounded-full bg-brand-action px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-ink disabled:opacity-50"
              >
                {loadingAudio === currentVoiceId ? (
                  <Spinner size="sm" />
                ) : playingVoiceId === currentVoiceId ? (
                  <ThiingsIcon name="pause" pxSize={16} />
                ) : (
                  <ThiingsIcon name="play" pxSize={16} />
                )}
                {t('voiceCurrentCard.preview', 'Preview')}
              </button>
            )}
            <button
              type="button"
              onClick={onToggleBrowser}
              aria-expanded={isBrowserOpen}
              className="rounded-full border border-brand-line px-4 py-2 text-sm font-medium text-brand-ink hover:border-brand-action"
            >
              {isBrowserOpen ? t('voiceCurrentCard.hideVoiceBrowser', 'Hide Voice Browser') : t('voiceCurrentCard.changeVoice', 'Change Voice')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
