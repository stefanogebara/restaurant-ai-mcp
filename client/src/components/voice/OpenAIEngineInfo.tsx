import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';

interface Props {
  engineStatus: string | undefined;
  currentOpenAIVoice: string;
}

const STATUS_LIGHT_STYLES: Record<string, string> = {
  active:  'bg-rose-500',
  testing: 'bg-amber-500',
};

/**
 * Status card for the Fast Voice engine. Previously this surfaced
 * "WebSocket Endpoint: seatable-voice.fly.dev" and "Engine: OpenAI Realtime API"
 * to non-technical restaurant owners â€” implementation details that read as
 * "is this broken?" to JoÃ£o. Now we lead with a plain-English status, and
 * keep the technical breadcrumbs behind a "Technical details" disclosure so
 * support can still grab them on demand.
 */
export default function OpenAIEngineInfo({ engineStatus, currentOpenAIVoice }: Props) {
  const { t } = useTranslation();
  const [showTech, setShowTech] = useState(false);
  const status = engineStatus || 'active';
  const isActive = status === 'active';

  return (
    <section className="py-5 border-b border-glass-border-dark">
      <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] mb-4 flex items-center gap-2">
        <ThiingsIcon name="info" pxSize={20} />
        {t('voiceEngine.statusHeader', 'AI receptionist status')}
      </h2>

      <div className="flex items-center gap-3">
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_LIGHT_STYLES[status] ?? 'bg-stone-400'}`}
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-semibold text-deep-charcoal">
            {isActive
              ? t('voiceEngine.statusActive', 'Running normally â€” ready to take calls.')
              : t('voiceEngine.statusTesting', 'In test mode â€” calls are previewed but not answered yet.')}
          </p>
          <p className="text-xs text-warm-stone mt-0.5">
            {t('voiceEngine.statusVoice', 'Voice: {{voice}}', { voice: currentOpenAIVoice })}
          </p>
        </div>
      </div>

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
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-warm-stone bg-soft-gray rounded-xl p-3">
          <div>
            <dt className="text-[10px] uppercase tracking-wider mb-1">{t('voiceEngine.techEngine', 'Engine')}</dt>
            <dd className="font-mono text-deep-charcoal">OpenAI Realtime API</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider mb-1">{t('voiceEngine.techEndpoint', 'Endpoint')}</dt>
            <dd className="font-mono text-deep-charcoal truncate">seatable-voice.fly.dev</dd>
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
