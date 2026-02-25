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
  return (
    <section className="bg-white border border-border-gray rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-soft-gray">
        <span className="text-[15px] font-semibold">Choose a Voice</span>
      </div>

      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-deep-charcoal">
              {pendingVoiceId ? (
                <span>
                  {selectedBrowserVoice?.name || pendingVoiceId}
                  <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-600/10 px-2 py-0.5 rounded-full">
                    pending
                  </span>
                </span>
              ) : (
                savedVoiceName || savedVoiceId || 'No voice set'
              )}
            </p>
            <div className="flex items-center gap-3 mt-1 text-sm text-stone-gray">
              <span className="capitalize">{selectedBrowserVoice?.gender || '—'}</span>
              <span>-</span>
              <span>{currentLanguage.toUpperCase()}</span>
              {selectedBrowserVoice?.accent && (
                <>
                  <span>-</span>
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
                className="px-4 py-2 text-sm font-medium bg-soft-gray hover:bg-border-gray rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {loadingAudio === currentVoiceId ? (
                  <Spinner size="sm" />
                ) : playingVoiceId === currentVoiceId ? (
                  <ThiingsIcon name="pause" pxSize={16} />
                ) : (
                  <ThiingsIcon name="play" pxSize={16} />
                )}
                Preview
              </button>
            )}
            <button
              type="button"
              onClick={onToggleBrowser}
              aria-expanded={isBrowserOpen}
              className="px-4 py-2 text-sm font-medium text-burgundy bg-burgundy/5 hover:bg-burgundy/10 rounded-xl transition-colors"
            >
              {isBrowserOpen ? 'Hide Voice Browser' : 'Change Voice'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
