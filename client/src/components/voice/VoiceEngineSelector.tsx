import { useTranslation } from 'react-i18next';
import type { VoiceEngineSettings } from '../../hooks/useVoiceEngineSettings';

const STATUS_STYLES: Record<string, string> = {
  active:  'bg-green-600/[8%] text-green-600',
  testing: 'bg-amber-600/[8%] text-amber-600',
};

interface Props {
  currentEngine: VoiceEngineSettings['voice_engine'];
  pendingEngine: VoiceEngineSettings['voice_engine'] | null;
  engineStatus?: string;
  onEngineSwitch: (target: VoiceEngineSettings['voice_engine']) => void;
}

export default function VoiceEngineSelector({ currentEngine, pendingEngine, engineStatus, onEngineSwitch }: Props) {
  const { t } = useTranslation();

  return (
    <section className="bg-white border border-border-gray rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-soft-gray">
        <span className="text-[15px] font-semibold">{t('settings.voiceEngine')}</span>
        {engineStatus && (
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[engineStatus] ?? 'bg-soft-gray text-stone-gray'}`}>
            {engineStatus.charAt(0).toUpperCase() + engineStatus.slice(1)}
          </span>
        )}
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onEngineSwitch('elevenlabs')}
            className={`text-left p-4 rounded-2xl border-2 transition-all ${
              currentEngine === 'elevenlabs'
                ? 'border-burgundy bg-burgundy/5'
                : 'border-border-gray hover:border-muted-stone'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-base font-semibold text-deep-charcoal">ElevenLabs</span>
              {currentEngine === 'elevenlabs' && (
                <span className="text-xs font-medium text-burgundy bg-burgundy/10 px-2 py-0.5 rounded-full">Current</span>
              )}
            </div>
            <p className="text-sm text-stone-gray">
              Managed voice agent with premium voice quality, voice cloning, and multilingual support.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onEngineSwitch('openai_realtime')}
            className={`text-left p-4 rounded-2xl border-2 transition-all ${
              currentEngine === 'openai_realtime'
                ? 'border-burgundy bg-burgundy/5'
                : 'border-border-gray hover:border-muted-stone'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-base font-semibold text-deep-charcoal">OpenAI Realtime</span>
              {currentEngine === 'openai_realtime' && (
                <span className="text-xs font-medium text-burgundy bg-burgundy/10 px-2 py-0.5 rounded-full">Current</span>
              )}
            </div>
            <p className="text-sm text-stone-gray">
              Lower cost, native tool calling with WebSocket-based real-time voice.
            </p>
          </button>
        </div>

        {pendingEngine && (
          <p className="mt-3 text-xs text-amber-600 bg-amber-600/10 rounded-xl px-3 py-2">
            Engine change pending. Click "Save Changes" to apply.
          </p>
        )}
      </div>
    </section>
  );
}
