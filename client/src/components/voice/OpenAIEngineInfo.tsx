import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';

interface Props {
  engineStatus: string | undefined;
  currentOpenAIVoice: string;
}

const STATUS_LIGHT_STYLES: Record<string, string> = {
  active:  'bg-emerald-700',
  testing: 'bg-amber-700',
};

export default function OpenAIEngineInfo({ engineStatus, currentOpenAIVoice }: Props) {
  const { t } = useTranslation();
  const [showTech, setShowTech] = useState(false);
  const status = engineStatus || 'unknown';
  const isActive = status === 'active';

  return (
    <section className="border-b border-brand-line py-5">
      <h2 className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-muted">
        <ThiingsIcon name="info" pxSize={20} />
        {t('voiceEngine.statusHeader', 'AI receptionist status')}
      </h2>

      <div className="flex items-center gap-3">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_LIGHT_STYLES[status] ?? 'bg-brand-muted'}`}
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-medium text-brand-ink">
            {isActive
              ? t('voiceEngine.statusActive', 'Agent marked active. Confirm it answers with a test call.')
              : status === 'testing'
                ? t('voiceEngine.statusTesting', 'Agent in test mode. Confirm routing before forwarding calls.')
                : t('voiceEngine.statusUnknown', 'Agent status is unavailable. Check the connection before forwarding calls.')}
          </p>
          <p className="mt-0.5 text-xs text-brand-muted">
            {t('voiceEngine.statusVoice', 'Voice: {{voice}}', { voice: currentOpenAIVoice })}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowTech((v) => !v)}
        className="mt-3 text-xs text-brand-muted underline underline-offset-2 hover:text-brand-ink"
      >
        {showTech
          ? t('voiceEngine.hideTech', 'Hide technical details')
          : t('voiceEngine.showTech', 'Show technical details')}
      </button>

      {showTech && (
        <dl className="mt-3 grid grid-cols-1 gap-3 border-t border-brand-line pt-3 text-xs text-brand-muted sm:grid-cols-2">
          <div>
            <dt className="text-[10px] uppercase tracking-wider mb-1">{t('voiceEngine.techEngine', 'Engine')}</dt>
            <dd className="font-mono text-brand-ink">OpenAI Realtime API</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider mb-1">{t('voiceEngine.techStatus', 'Internal status')}</dt>
            <dd className="font-mono text-brand-ink">{status}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wider mb-1">{t('voiceEngine.techVoiceId', 'Voice id')}</dt>
            <dd className="font-mono text-brand-ink">{currentOpenAIVoice}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
