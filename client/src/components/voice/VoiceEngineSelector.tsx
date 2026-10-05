import { useTranslation } from 'react-i18next';
import type { VoiceEngineSettings } from '../../hooks/useVoiceEngineSettings';

const STATUS_STYLES: Record<string, string> = {
  active:  'bg-emerald-800/10 text-emerald-900',
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
    <section className="overflow-hidden border-b border-brand-line pb-6">
      <div className="flex items-center justify-between py-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted">{t('settings.voiceEngine')}</span>
        {engineStatus && (
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[engineStatus] ?? 'bg-soft-gray text-stone-gray'}`}>
            {t(`voiceEngine.status.${engineStatus}`, engineStatus.charAt(0).toUpperCase() + engineStatus.slice(1))}
          </span>
        )}
      </div>

      <div className="pt-1">
        <p className="mb-2 max-w-[62ch] text-sm leading-6 text-brand-muted">
          {t('voiceEngine.selectionIntro', 'Choose the voice service for your AI receptionist. You can change it later, but test a call after each change.')}
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onEngineSwitch('elevenlabs')}
            className={`rounded-[18px] border p-5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action ${
              currentEngine === 'elevenlabs'
                ? 'border-brand-action bg-white/65'
                : 'border-brand-line bg-transparent hover:border-brand-action'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-brand text-base font-semibold text-brand-ink">
                {t('voiceEngine.premiumName', 'ElevenLabs')}
              </span>
              {currentEngine === 'elevenlabs' && (
                <span className="rounded-full bg-brand-action/10 px-2 py-0.5 text-xs font-medium text-brand-action">{t('voiceEngine.current', 'Current')}</span>
              )}
            </div>
            <p className="text-sm leading-5 text-brand-muted">
              {t('voiceEngine.elevenlabsDesc', 'Use the voice and agent configured in ElevenLabs. Listen to a preview and test a call before routing customers.')}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onEngineSwitch('openai_realtime')}
            className={`rounded-[18px] border p-5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action ${
              currentEngine === 'openai_realtime'
                ? 'border-brand-action bg-white/65'
                : 'border-brand-line bg-transparent hover:border-brand-action'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-brand text-base font-semibold text-brand-ink">
                {t('voiceEngine.fastName', 'OpenAI Realtime')}
              </span>
              {currentEngine === 'openai_realtime' && (
                <span className="rounded-full bg-brand-action/10 px-2 py-0.5 text-xs font-medium text-brand-action">{t('voiceEngine.current', 'Current')}</span>
              )}
            </div>
            <p className="text-sm leading-5 text-brand-muted">
              {t('voiceEngine.openaiDesc', 'Use the real-time agent configured with OpenAI. Test the voice, response time, and booking flow before routing customers.')}
            </p>
          </button>
        </div>

        {pendingEngine && (
          <p className="mt-3 text-xs text-amber-600 bg-amber-600/10 rounded-xl px-3 py-2">
            {t('voiceEngine.changePending', 'Change pending. Click "Save Changes" to apply.')}
          </p>
        )}
      </div>
    </section>
  );
}
