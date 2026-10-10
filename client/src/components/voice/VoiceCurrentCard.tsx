import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import Spinner from '../common/Spinner';
import type { EnhancedVoice } from './voiceTypes';

interface Props {
  variant: 'identity' | 'control' | 'status';
  surface?: 'paper' | 'olive';
  agentName: string | undefined;
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
  variant, surface = 'paper', currentVoiceId, pendingVoiceId, selectedBrowserVoice, savedVoiceName,
  sampleText, sampleKind, isBrowserOpen, loadingAudio,
  isSamplePlaying, sampleDuration, sampleCurrentTime, onSeek, onPlay, onToggleBrowser,
}: Props) {
  const { t } = useTranslation();
  const onOlive = surface === 'olive';
  const voiceName = pendingVoiceId ? selectedBrowserVoice?.name : savedVoiceName;
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const progress = sampleDuration > 0 ? Math.min(100, Math.max(0, (sampleCurrentTime / sampleDuration) * 100)) : 0;
  const sampleStatus = sampleKind === 'draft'
    ? sampleText
      ? t('voiceCurrentCard.draftCaption', 'Unsaved draft · not a live call.')
      : t('voiceCurrentCard.emptyCaption', 'Write a line to audition the draft.')
    : sampleKind === 'saved'
      ? t('voiceCurrentCard.savedCaption', 'Preview · not a live call.')
      : t('voiceCurrentCard.exampleCaption', 'Example preview · not saved.');

  if (variant === 'identity') {
    return (
      <div className={`flex min-w-0 items-center justify-between gap-3 font-brand ${onOlive ? 'text-brand-paper' : 'text-brand-ink'}`} aria-label={t('voiceCurrentCard.selectedVoice', 'Selected voice')}>
        <div className="min-w-0">
          <span className={`block text-[11px] ${onOlive ? 'text-brand-paper/75' : 'text-brand-muted'}`}>{t('voiceCurrentCard.selectedVoice', 'Selected voice')}</span>
          <h2 className={`font-brand font-medium tracking-[-0.025em] ${onOlive ? 'text-[21px] leading-[1.1]' : 'text-[18px] leading-[1.2]'}`}>{voiceName || t('voiceCurrentCard.configuredVoice', 'Configured voice')}</h2>
        </div>
        {pendingVoiceId && <span className={`text-[11px] font-medium ${onOlive ? 'text-amber-200' : 'text-amber-800'}`}>{t('voiceCurrentCard.pending', 'pending')}</span>}
        <button
          type="button"
          onClick={onToggleBrowser}
          aria-expanded={isBrowserOpen}
          aria-label={isBrowserOpen ? t('voiceCurrentCard.hideVoiceBrowser', 'Close voice library') : t('voiceCurrentCard.changeVoice', 'Change voice')}
          className={`inline-flex min-h-11 shrink-0 items-center px-2 text-[12px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${onOlive ? 'text-brand-paper underline underline-offset-4 focus-visible:outline-brand-paper' : 'text-brand-action underline underline-offset-4 focus-visible:outline-brand-action'}`}
        >
          {isBrowserOpen ? t('voiceCurrentCard.closeShort', 'Close') : t('voiceCurrentCard.changeShort', 'Change')}
        </button>
      </div>
    );
  }

  if (variant === 'control') {
    return currentVoiceId ? (
      <button
        type="button"
        onClick={onPlay}
        disabled={loadingAudio === currentVoiceId || !sampleText}
        aria-label={isSamplePlaying ? t('voiceCurrentCard.pauseSample', 'Pause sample') : t('voiceCurrentCard.playSample', 'Play sample')}
        className={`grid size-14 shrink-0 place-items-center rounded-full disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:size-16 ${onOlive ? 'bg-brand-paper text-brand-action hover:bg-white focus-visible:outline-brand-paper' : 'bg-brand-action text-brand-paper hover:bg-brand-ink focus-visible:outline-brand-action'}`}
      >
        {loadingAudio === currentVoiceId ? <Spinner size="sm" /> : <ThiingsIcon name={isSamplePlaying ? 'pause' : 'play'} pxSize={21} />}
      </button>
    ) : null;
  }

  return (
    <div className={`min-w-0 font-brand ${onOlive ? 'text-brand-paper' : 'text-brand-ink'}`} aria-label={t('voiceCurrentCard.voiceSample', 'Voice sample')}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-[14px] font-medium leading-5">{loadingAudio === currentVoiceId
            ? t('voiceCurrentCard.preparingSample', 'Preparing sample')
            : isSamplePlaying
              ? t('voiceCurrentCard.playingSample', 'Playing sample')
              : t('voiceCurrentCard.hearGreeting', 'Hear greeting')}</p>
          <p className={`text-[12px] leading-4 ${onOlive ? 'text-brand-paper/75' : 'text-brand-muted'}`}>{sampleStatus}</p>
        </div>
        {sampleDuration > 0 && <span className={`shrink-0 text-[11px] tabular-nums ${onOlive ? 'text-brand-paper/75' : 'text-brand-muted'}`}>{formatTime(sampleCurrentTime)} / {formatTime(sampleDuration)}</span>}
      </div>
      {sampleDuration > 0 && <div className="relative mt-2 h-5">
        <div aria-hidden="true" className={`absolute inset-x-0 top-[9px] h-px ${onOlive ? 'bg-brand-paper/35' : 'bg-brand-line'}`}><div className={`h-full ${onOlive ? 'bg-brand-paper' : 'bg-brand-action'}`} style={{ width: `${progress}%` }} /></div>
        <input type="range" min="0" max="100" step="1" value={progress} onChange={event => onSeek(Number(event.target.value) / 100)} aria-label={t('voiceCurrentCard.seekSample', 'Seek sample')} className={`voice-sample-range absolute inset-0 w-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${onOlive ? 'focus-visible:outline-brand-paper' : 'focus-visible:outline-brand-action'}`} />
      </div>}
      <p className="sr-only">{sampleText ? `“${sampleText}”` : t('voiceCurrentCard.emptyDraft', 'Write a line to hear it.')}</p>
    </div>
  );
}
