import { useTranslation } from 'react-i18next';
import type { VoiceEngineSettings } from '../../hooks/useVoiceEngineSettings';

const STATUS_STYLES: Record<string, string> = {
  active:  'bg-rose-600/[8%] text-rose-600',
  testing: 'bg-amber-600/[8%] text-amber-600',
};

interface Props {
  currentEngine: VoiceEngineSettings['voice_engine'];
  pendingEngine: VoiceEngineSettings['voice_engine'] | null;
  engineStatus?: string;
  onEngineSwitch: (target: VoiceEngineSettings['voice_engine']) => void;
}

/**
 * The two voice engines are presented to the user by what they FEEL like
 * (premium / fast), not by their vendor name. João doesn't know what
 * "ElevenLabs" or "OpenAI Realtime" mean — those are implementation
 * details. The vendor still drives the dropdowns and configuration
 * downstream; we just stop exposing the brand on the primary choice.
 */
export default function VoiceEngineSelector({ currentEngine, pendingEngine, engineStatus, onEngineSwitch }: Props) {
  const { t } = useTranslation();

  return (
    <section className="overflow-hidden pb-5 border-b border-glass-border-dark">
      <div className="flex items-center justify-between py-5 border-b border-glass-border-dark">
        <span className="text-[13px] font-semibold uppercase tracking-widest text-[#111827]">{t('settings.voiceEngine')}</span>
        {engineStatus && (
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[engineStatus] ?? 'bg-soft-gray text-stone-gray'}`}>
            {t(`voiceEngine.status.${engineStatus}`, engineStatus.charAt(0).toUpperCase() + engineStatus.slice(1))}
          </span>
        )}
      </div>

      <div className="p-6">
        <p className="text-sm text-stone-gray mb-2">
          {t('voiceEngine.intro', 'Which voice should answer your phone? You can switch later — no calls are missed during the change.')}
        </p>
        {/* Disclosure: 2-sentence guidance so owners don't have to guess from
            the cards alone. Native <details> so no JS / state required —
            collapsible, accessible, no library. */}
        <details className="mb-4 text-sm">
          <summary className="text-burgundy hover:text-burgundy-dark cursor-pointer underline underline-offset-2 select-none w-fit">
            {t('voiceEngine.helpToggle', 'Qual escolher?')}
          </summary>
          <div className="mt-2 text-stone-gray leading-relaxed bg-soft-gray rounded-xl p-3">
            <p className="mb-2">
              <strong>{t('voiceEngine.premiumName', 'Premium voice')}:</strong>{' '}
              {t('voiceEngine.helpPremium', 'Escolha quando a voz faz parte da sua marca — fine dining, hotelaria, atendimento VIP. Soa humana, mas custa mais e responde um pouco mais devagar.')}
            </p>
            <p>
              <strong>{t('voiceEngine.fastName', 'Fast voice')}:</strong>{' '}
              {t('voiceEngine.helpFast', 'Escolha quando o volume é alto e o tempo de resposta importa — pizzaria, casual dining, delivery. Custa metade, responde em meio segundo.')}
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
                {t('voiceEngine.premiumName', 'Premium voice')}
              </span>
              {currentEngine === 'elevenlabs' && (
                <span className="text-xs font-medium text-burgundy bg-burgundy/10 px-2 py-0.5 rounded-full">{t('voiceEngine.current', 'Current')}</span>
              )}
            </div>
            <p className="text-sm text-stone-gray mb-3">
              {t('voiceEngine.elevenlabsDesc', 'The most human-sounding voice. Pick from 100+ accents and tones. Best for restaurants where the voice is part of your brand.')}
            </p>
            {/* Cost + latency badges — audit found owners couldn't compare
                the two engines without hearing them; until we ship audio
                samples, surface the concrete numbers so the tradeoff
                (premium-but-pricier vs fast-and-cheaper) is legible. */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-soft-gray text-stone-gray">
                <span aria-hidden="true">⏱</span>
                {t('voiceEngine.elevenlabsLatency', '~1.2 s')}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-soft-gray text-stone-gray">
                <span aria-hidden="true">💰</span>
                {t('voiceEngine.elevenlabsCost', '~R$ 0.40/min')}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                {t('voiceEngine.elevenlabsTag', 'Mais humano')}
              </span>
            </div>
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
                {t('voiceEngine.fastName', 'Fast voice')}
              </span>
              {currentEngine === 'openai_realtime' && (
                <span className="text-xs font-medium text-burgundy bg-burgundy/10 px-2 py-0.5 rounded-full">{t('voiceEngine.current', 'Current')}</span>
              )}
            </div>
            <p className="text-sm text-stone-gray mb-3">
              {t('voiceEngine.openaiDesc', 'Replies faster and costs less. The voice is good but less customisable. Best for high-volume restaurants.')}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-soft-gray text-stone-gray">
                <span aria-hidden="true">⏱</span>
                {t('voiceEngine.openaiLatency', '~0.6 s')}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-soft-gray text-stone-gray">
                <span aria-hidden="true">💰</span>
                {t('voiceEngine.openaiCost', '~R$ 0.18/min')}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                {t('voiceEngine.openaiTag', 'Mais rápido')}
              </span>
            </div>
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
