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
  isSamplePlaying: boolean;
  onPlay: () => void;
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
  isSamplePlaying,
  onPlay,
  onToggleBrowser,
}: Props) {
  const { t, i18n } = useTranslation();
  const languageName = new Intl.DisplayNames([i18n.language || 'en'], { type: 'language' }).of(currentLanguage)
    || currentLanguage.toUpperCase();
  const voiceName = pendingVoiceId
    ? selectedBrowserVoice?.name || pendingVoiceId
    : savedVoiceName || (savedVoiceId
      ? t('voiceCurrentCard.restaurantVoice', 'Voice for {{restaurant}}', { restaurant: restaurantName || t('voiceCurrentCard.yourRestaurant', 'your restaurant') })
      : t('voiceCurrentCard.noVoiceSet', 'No voice set'));
  const previewText = getPreviewText(currentLanguage, restaurantName);
  const firstComma = previewText.search(/[,，]/u);
  const salutation = firstComma >= 0 ? previewText.slice(0, firstComma + 1) : '';
  const spokenMessage = firstComma >= 0 ? previewText.slice(firstComma + 1).trim() : previewText;

  return (
    <section className="flex h-full min-w-0 flex-col justify-between bg-brand-action px-5 py-6 text-brand-paper sm:px-8 sm:py-8" aria-label={t('voiceCurrentCard.voiceSample', 'Voice sample')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <h2 className="min-w-0 font-brand font-medium">{voiceName}</h2>
        <span className="text-[12px] text-brand-paper/75">{languageName}</span>
      </div>
      <p className="my-6 max-w-[32ch] font-brand text-[24px] leading-[1.12] tracking-[-0.035em] min-[360px]:text-[27px] sm:my-8 sm:text-[38px] lg:text-[41px]">
        {salutation && <><em className="font-serif font-normal italic">{salutation}</em>{' '}</>}{spokenMessage}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {currentVoiceId && (
          <button
            type="button"
            onClick={onPlay}
            disabled={loadingAudio === currentVoiceId}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-paper px-5 text-[13px] font-semibold text-brand-ink hover:bg-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-paper"
          >
            {loadingAudio === currentVoiceId ? <Spinner size="sm" /> : <ThiingsIcon name={isSamplePlaying ? 'pause' : 'play'} pxSize={18} />}
            {isSamplePlaying
              ? t('voiceCurrentCard.pauseSample', 'Pause sample')
              : t('voiceCurrentCard.playSample', 'Play sample')}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleBrowser}
          aria-expanded={isBrowserOpen}
          className="min-h-10 text-[13px] font-medium text-brand-paper underline underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-paper"
        >
          {isBrowserOpen ? t('voiceCurrentCard.hideVoiceBrowser', 'Hide Voice Browser') : t('voiceCurrentCard.changeVoice', 'Change Voice')}
        </button>
        {pendingVoiceId && <span className="text-[12px] font-semibold text-amber-200">{t('voiceCurrentCard.pending', 'pending')}</span>}
        {selectedBrowserVoice?.accent && <span className="text-[12px] text-brand-paper/70">{selectedBrowserVoice.accent}</span>}
      </div>
    </section>
  );
}
