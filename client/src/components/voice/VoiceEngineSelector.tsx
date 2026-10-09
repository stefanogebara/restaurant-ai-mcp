import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VoiceEngineSettings } from '../../hooks/useVoiceEngineSettings';

interface Props {
  currentEngine: VoiceEngineSettings['voice_engine'];
  pendingEngine: VoiceEngineSettings['voice_engine'] | null;
  engineStatus?: string;
  onEngineSwitch: (target: VoiceEngineSettings['voice_engine']) => void;
}

export default function VoiceEngineSelector({ currentEngine, pendingEngine, engineStatus, onEngineSwitch }: Props) {
  const { t } = useTranslation();
  const [showChoices, setShowChoices] = useState(false);
  const engines: Array<{ id: VoiceEngineSettings['voice_engine']; name: string; description: string }> = [
    { id: 'elevenlabs', name: t('voiceEngine.premiumName', 'ElevenLabs'), description: t('voiceEngine.elevenlabsDesc', 'Uses the agent and voice configured in ElevenLabs.') },
    { id: 'openai_realtime', name: t('voiceEngine.fastName', 'OpenAI Realtime'), description: t('voiceEngine.openaiDesc', 'Uses the real-time agent configured with OpenAI.') },
  ];
  const selected = engines.find(engine => engine.id === currentEngine) ?? engines[0];

  return (
    <section className="border-b border-brand-line py-6">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">{t('settings.voiceEngine')}</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-brand text-[20px] font-medium leading-tight text-brand-ink">{selected.name}</h2>
            {pendingEngine && <span className="text-xs font-semibold text-amber-800">{t('voiceCurrentCard.pending', 'pending')}</span>}
            {!pendingEngine && engineStatus && engineStatus !== 'active' && (
              <span className="text-xs font-semibold text-amber-800">{t(`voiceEngine.status.${engineStatus}`, engineStatus)}</span>
            )}
          </div>
          <p className="mt-1 max-w-[52ch] text-[13px] leading-5 text-brand-muted">{selected.description}</p>
        </div>
        <button
          type="button"
          aria-expanded={showChoices}
          aria-controls="voice-engine-choices"
          onClick={() => setShowChoices(value => !value)}
          className="shrink-0 pt-1 text-sm font-semibold text-brand-action underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
        >
          {showChoices ? t('voiceEngine.hideChoices', 'Close') : t('voiceEngine.changeService', 'Change service')}
        </button>
      </div>

      {showChoices && (
        <div id="voice-engine-choices" className="mt-5 border-t border-brand-line pt-4">
          <p className="mb-3 max-w-[62ch] text-sm leading-6 text-brand-muted">{t('voiceEngine.selectionIntro', 'Choose the voice service. Save your change, then test a real call again.')}</p>
          <div className="grid gap-0 border-y border-brand-line sm:grid-cols-2 sm:gap-x-6">
            {engines.map(engine => (
              <button
                key={engine.id}
                type="button"
                aria-pressed={currentEngine === engine.id}
                onClick={() => {
                  onEngineSwitch(engine.id);
                  setShowChoices(false);
                }}
                className="flex min-h-14 items-center justify-between gap-3 border-b border-brand-line py-3 text-left last:border-b-0 sm:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
              >
                <span className="text-sm font-medium text-brand-ink">{engine.name}</span>
                {currentEngine === engine.id && <span className="text-xs text-brand-muted">{t('voiceEngine.current', 'Current')}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
