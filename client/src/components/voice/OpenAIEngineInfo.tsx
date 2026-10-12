import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';

interface Props {
  engineStatus: string | undefined;
  currentOpenAIVoice: string;
}

const STATUS_LIGHT_STYLES: Record<string, string> = {
  active:  'bg-muted-stone',
  testing: 'bg-amber-500',
  disabled: 'bg-red-700',
};

/**
 * Status card for the Fast Voice engine. Previously this surfaced
 * "WebSocket Endpoint: seatable-voice.fly.dev" and "Engine: OpenAI Realtime API"
 * to non-technical restaurant owners — implementation details that read as
 * "is this broken?" to João. Now we lead with a plain-English status, and
 * keep the technical breadcrumbs behind a "Technical details" disclosure so
 * support can still grab them on demand.
 */
export default function OpenAIEngineInfo({ engineStatus, currentOpenAIVoice }: Props) {
  const { t } = useTranslation();
  const [showTech, setShowTech] = useState(false);
  const status = engineStatus || 'unknown';
  const isActive = status === 'active';

  return (
    <section className="py-5 border-b border-glass-border-dark">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone mb-4 flex items-center gap-2">
        <ThiingsIcon name="info" pxSize={20} />
        {t('voiceEngine.statusHeader')}
      </h2>

      <div className="flex items-center gap-3">
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_LIGHT_STYLES[status] ?? 'bg-muted-stone'}`}
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-semibold text-deep-charcoal">
            {isActive
              ? t('voiceEngine.statusActive')
              : status === 'testing'
                ? t('voiceEngine.statusTesting')
                : status === 'disabled'
                  ? t('voiceEngine.statusDisabled')
                  : t('voiceEngine.statusUnknown')}
          </p>
          <p className="text-xs text-warm-stone mt-0.5">
            {t('voiceEngine.statusVoice', 'Voice: {{voice}}', { voice: currentOpenAIVoice })}
          </p>
        </div>
      </div>

      <a href="#voice-settings:phone" className="mt-3 inline-block text-sm text-burgundy underline underline-offset-2 hover:text-burgundy-dark">
        {t('agentInfo.checkPhone')}
      </a>

      <button
        type="button"
        onClick={() => setShowTech((v) => !v)}
        className="mt-3 text-xs text-muted-stone hover:text-deep-charcoal underline underline-offset-2"
      >
        {showTech
          ? t('voiceEngine.hideTech', 'Hide technical details')
          : t('voiceEngine.showTech', 'Show technical details')}
      </button>

      {showTech && (
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-glass-border-dark p-3 text-xs text-warm-stone">
          <div>
            <dt className="text-[10px] uppercase tracking-wider mb-1">{t('voiceEngine.techEngine', 'Engine')}</dt>
            <dd className="font-mono text-deep-charcoal">OpenAI Realtime API</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider mb-1">{t('voiceEngine.techStatus', 'Internal status')}</dt>
            <dd className="font-mono text-deep-charcoal">{status}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider mb-1">{t('voiceEngine.techVoiceId', 'Voice id')}</dt>
            <dd className="font-mono text-deep-charcoal">{currentOpenAIVoice}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
