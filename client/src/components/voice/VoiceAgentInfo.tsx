import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { useToast } from '../../contexts/ToastContext';

interface Props {
  agentId: string;
  updatedAt: string | undefined;
  createdAt: string | undefined;
}

/**
 * Provider registration is not proof of a successful customer call.
 * Keep technical details behind a disclosure for support.
 */
export default function VoiceAgentInfo({ agentId, updatedAt, createdAt }: Props) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [showTech, setShowTech] = useState(false);

  const formatDate = (value: string) => new Intl.DateTimeFormat(i18n.language || 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
  const lastUpdated = updatedAt
    ? formatDate(updatedAt)
    : null;

  return (
    <section className="border-b border-brand-line py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <button
          type="button"
          onClick={() => setShowTech((v) => !v)}
          aria-expanded={showTech}
          className="inline-flex min-h-10 items-center gap-2 font-brand text-[13px] font-medium text-brand-muted underline underline-offset-4 hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-action"
        >
          <ThiingsIcon name="info" pxSize={18} />
          {showTech
            ? t('agentInfo.hideTech', 'Hide technical details')
            : t('agentInfo.showTech', 'Show technical details')}
        </button>
        {lastUpdated && (
          <p className="text-[12px] text-brand-muted">
            {t('agentInfo.lastUpdatedShort', 'Last updated {{when}}', { when: lastUpdated })}
          </p>
        )}
      </div>

      {showTech && (
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-soft-gray rounded-xl p-3">
          <div>
            <dt className="text-muted-stone text-[10px] uppercase tracking-wider mb-1">{t('agentInfo.voiceEngine')}</dt>
            <dd className="text-brand-muted">{t('agentInfo.modelUnverified', 'Model not verified from the live agent')}</dd>
          </div>
          <div>
            <dt className="text-muted-stone text-[10px] uppercase tracking-wider mb-1">{t('agentInfo.agentId')}</dt>
            <div className="flex items-center gap-2">
              <dd className="text-deep-charcoal font-mono truncate">{agentId}</dd>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(agentId); toast.info(t('agentInfo.agentIdCopied')); }}
                aria-label={t('agentInfo.copyAgentId')}
                className="text-burgundy hover:text-burgundy-dark flex-shrink-0 transition-colors"
              >
                <ThiingsIcon name="clipboard" pxSize={14} />
              </button>
            </div>
          </div>
          {createdAt && (
            <div>
              <dt className="text-muted-stone text-[10px] uppercase tracking-wider mb-1">{t('agentInfo.created')}</dt>
              <dd className="text-deep-charcoal">{formatDate(createdAt)}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
