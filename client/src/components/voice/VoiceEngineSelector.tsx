import { useTranslation } from 'react-i18next';
import type { VoiceEngineSettings } from '../../hooks/useVoiceEngineSettings';

const STATUS_STYLES: Record<string, string> = {
  testing: 'bg-amber-600/[0.12] text-amber-700',
  disabled: 'bg-red-700/[0.08] text-red-700',
};

interface Props {
  currentEngine: VoiceEngineSettings['voice_engine'];
  pendingEngine: VoiceEngineSettings['voice_engine'] | null;
  engineStatus?: string;
  onEngineSwitch: (target: VoiceEngineSettings['voice_engine']) => void;
}

/**
 * The two voice engines are presented to the user by what they FEEL like
 * (premium / direct), not by their vendor name. João doesn't know what
 * "ElevenLabs" or "OpenAI Realtime" mean — those are implementation
 * details. The vendor still drives the dropdowns and configuration
 * downstream; we just stop exposing the brand on the primary choice.
 */
export default function VoiceEngineSelector({ currentEngine, pendingEngine, engineStatus, onEngineSwitch }: Props) {
  const { t } = useTranslation();

  return (
    <section className="overflow-hidden pb-5 border-b border-glass-border-dark">
      <div className="flex items-center justify-between py-5 border-b border-glass-border-dark">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone">{t('settings.voiceEngine')}</span>
        {!pendingEngine && engineStatus && engineStatus !== 'active' && (
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[engineStatus] ?? 'bg-muted-stone/[0.10] text-muted-stone'}`}>
            {t(`voiceEngine.status.${engineStatus}`, engineStatus.charAt(0).toUpperCase() + engineStatus.slice(1))}
          </span>
        )}
      </div>

      <div className="py-6">
        <p className="text-[15px] text-muted-stone mb-2">
          {t('voiceEngine.intro')}
        </p>
        {/* Disclosure: 2-sentence guidance so owners don't have to guess from
            the cards alone. Native <details> so no JS / state required —
            collapsible, accessible, no library. */}
        <details className="mb-4 text-sm">
          <summary className="text-burgundy hover:text-burgundy-dark cursor-pointer underline underline-offset-2 select-none w-fit">
            {t('voiceEngine.helpToggle')}
          </summary>
          <div className="mt-2 text-muted-stone leading-relaxed border-l border-glass-border-dark pl-4">
            <p className="mb-2">
              <strong>{t('voiceEngine.premiumName')}:</strong>{' '}
              {t('voiceEngine.helpPremium')}
            </p>
            <p>
              <strong>{t('voiceEngine.fastName')}:</strong>{' '}
              {t('voiceEngine.helpFast')}
            </p>
          </div>
        </details>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onEngineSwitch('elevenlabs')}
            className={`text-left p-4 rounded-2xl border-2 transition-all ${
              currentEngine === 'elevenlabs'
                ? 'border-burgundy bg-burgundy/5'
                : 'border-glass-border-dark hover:border-muted-stone'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-base font-semibold text-deep-charcoal">
                {t('voiceEngine.premiumName')}
              </span>
              {currentEngine === 'elevenlabs' && (
                <span className="text-xs font-medium text-deep-charcoal bg-deep-charcoal/[0.06] px-2 py-0.5 rounded-full">{t('voiceEngine.current')}</span>
              )}
            </div>
            <p className="text-sm text-muted-stone">
              {t('voiceEngine.elevenlabsDesc')}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onEngineSwitch('openai_realtime')}
            className={`text-left p-4 rounded-2xl border-2 transition-all ${
              currentEngine === 'openai_realtime'
                ? 'border-burgundy bg-burgundy/5'
                : 'border-glass-border-dark hover:border-muted-stone'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-base font-semibold text-deep-charcoal">
                {t('voiceEngine.fastName')}
              </span>
              {currentEngine === 'openai_realtime' && (
                <span className="text-xs font-medium text-deep-charcoal bg-deep-charcoal/[0.06] px-2 py-0.5 rounded-full">{t('voiceEngine.current')}</span>
              )}
            </div>
            <p className="text-sm text-muted-stone">
              {t('voiceEngine.openaiDesc')}
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
