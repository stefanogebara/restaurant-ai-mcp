import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import Spinner from '../common/Spinner';
import type { EnhancedVoice } from './voiceTypes';

interface Props {
  currentVoiceId: string;
  pendingVoiceId: string | null;
  selectedBrowserVoice: EnhancedVoice | undefined;
  savedVoiceName: string | undefined;
  currentLanguage: string;
  sampleText: string;
  sampleKind: 'draft' | 'saved' | 'example';
  isBrowserOpen: boolean;
  loadingAudio: string | null;
  isSamplePlaying: boolean;
  sampleDuration: number;
  sampleCurrentTime: number;
  onSeek: (fraction: number) => void;
  onPlay: () => void;
  onToggleBrowser: () => void;
}

export default function VoiceCurrentCard({
  currentVoiceId, pendingVoiceId, selectedBrowserVoice, savedVoiceName,
  currentLanguage, sampleText, sampleKind,
  isBrowserOpen, loadingAudio, isSamplePlaying, sampleDuration,
  sampleCurrentTime, onSeek, onPlay, onToggleBrowser,
}: Props) {
  const { t, i18n } = useTranslation();
  const languageName = new Intl.DisplayNames([i18n.language || 'en'], { type: 'language' }).of(currentLanguage)
    || currentLanguage.toUpperCase();
  const voiceName = pendingVoiceId ? selectedBrowserVoice?.name : savedVoiceName;
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const progress = sampleDuration > 0 ? Math.min(100, Math.max(0, (sampleCurrentTime / sampleDuration) * 100)) : 0;
  const sampleStatus = sampleKind === 'draft'
    ? sampleText
      ? t('voiceCurrentCard.draftCaption', 'Unsaved draft preview · not a live call.')
      : t('voiceCurrentCard.emptyCaption', 'Write a line to audition the draft.')
    : sampleKind === 'saved'
      ? t('voiceCurrentCard.savedCaption', 'Voice preview · not a live call.')
      : t('voiceCurrentCard.exampleCaption', 'Example preview · not saved.');

  return (
    <section className="min-w-0 lg:mt-1 lg:border-l lg:border-brand-line lg:pl-7" aria-label={t('voiceCurrentCard.voiceSample', 'Voice sample')}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 lg:items-start lg:gap-y-3">
        <div className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full bg-brand-action py-1.5 pl-1.5 pr-4 text-brand-paper">
          {currentVoiceId && (
            <button
              type="button"
              onClick={onPlay}
              disabled={loadingAudio === currentVoiceId || !sampleText}
              aria-label={isSamplePlaying ? t('voiceCurrentCard.pauseSample', 'Pause sample') : t('voiceCurrentCard.playSample', 'Play sample')}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-paper text-brand-ink hover:bg-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-paper"
            >
              {loadingAudio === currentVoiceId ? <Spinner size="sm" /> : <ThiingsIcon name={isSamplePlaying ? 'pause' : 'play'} pxSize={15} />}
            </button>
          )}
          <span className="min-w-0 truncate text-[13px] font-medium sm:text-[14px]">{t('voiceCurrentCard.hearGreeting', 'Hear greeting')}</span>
        </div>
        <button
          type="button"
          onClick={onToggleBrowser}
          aria-expanded={isBrowserOpen}
          className="min-h-9 shrink-0 text-[12px] font-medium text-brand-action underline underline-offset-4 hover:text-brand-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
        >
          {isBrowserOpen ? t('voiceCurrentCard.hideVoiceBrowser', 'Close voice library') : t('voiceCurrentCard.changeVoice', 'Change voice')}
        </button>
        {pendingVoiceId && <span className="text-[11px] font-semibold text-amber-800">{t('voiceCurrentCard.pending', 'pending')}</span>}
        <p className="w-full text-[12px] leading-5 text-brand-muted">{voiceName ? `${voiceName} · ` : ''}{languageName} · {sampleStatus}
          {sampleDuration > 0 && <span className="ml-2 whitespace-nowrap tabular-nums">{formatTime(sampleCurrentTime)} / {formatTime(sampleDuration)}</span>}
        </p>
      </div>
      {sampleDuration > 0 && <div className="relative mt-2 h-5 max-w-[440px]">
        <div aria-hidden="true" className="absolute inset-x-0 top-[9px] h-px bg-brand-line"><div className="h-full bg-brand-action" style={{ width: `${progress}%` }} /></div>
        <input type="range" min="0" max="100" step="1" value={progress} onChange={event => onSeek(Number(event.target.value) / 100)} aria-label={t('voiceCurrentCard.seekSample', 'Seek sample')} className="voice-sample-range absolute inset-0 w-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action" />
      </div>}
      <p className="sr-only">{sampleText ? `“${sampleText}”` : t('voiceCurrentCard.emptyDraft', 'Write a line to hear it.')}</p>
    </section>
  );
}
