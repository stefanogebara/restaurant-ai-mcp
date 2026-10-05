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
  const { t } = useTranslation();
  const toast = useToast();
  const [showTech, setShowTech] = useState(false);

  const lastUpdated = updatedAt
    ? new Date(updatedAt).toLocaleString()
    : null;

  return (
    <section className="border-b border-brand-line py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-muted">
          <ThiingsIcon name="info" pxSize={20} />
          {t('agentInfo.title')}
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-800/10 px-2.5 py-1 text-xs font-medium text-amber-900">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-700" />
          {t('agentInfo.registrationOnly', 'Registered, not call-verified')}
        </span>
      </div>

      <p className="max-w-[65ch] text-sm leading-6 text-brand-ink">
        {t('agentInfo.verificationNeeded', 'Your agent is registered. Connect a phone line, then confirm a test call and a completed reservation before relying on it.')}
      </p>
      {lastUpdated && (
        <p className="text-xs text-warm-stone mt-1">
          {t('agentInfo.lastUpdatedShort', 'Last updated {{when}}', { when: lastUpdated })}
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowTech((v) => !v)}
        className="mt-3 text-xs text-muted-stone hover:text-deep-charcoal underline underline-offset-2"
      >
        {showTech
          ? t('agentInfo.hideTech', 'Hide technical details')
          : t('agentInfo.showTech', 'Show technical details')}
      </button>

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
              <dd className="text-deep-charcoal">{new Date(createdAt).toLocaleString()}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
