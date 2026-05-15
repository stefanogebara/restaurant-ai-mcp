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
 * Lead with the host-facing fact: "Ready to take calls — last updated 3 days
 * ago." The previous version showed "Voice Engine: turbo_v2.5" and a copyable
 * UUID Agent ID as primary surface area — neither means anything to a
 * restaurant owner. Keep the technical details available behind a disclosure
 * for support.
 */
export default function VoiceAgentInfo({ agentId, updatedAt, createdAt }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const [showTech, setShowTech] = useState(false);

  const lastUpdated = updatedAt
    ? new Date(updatedAt).toLocaleString()
    : null;

  return (
    <section className="py-5 border-b border-[#E5E7EB]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#111827] flex items-center gap-2">
          <ThiingsIcon name="info" pxSize={20} />
          {t('agentInfo.title')}
        </h2>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {t('voice.agentActive', 'Ready to take calls')}
        </span>
      </div>

      <p className="text-sm text-deep-charcoal">
        {t('agentInfo.summary', 'Your AI receptionist is set up and ready to answer your phone.')}
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
            <dd className="text-deep-charcoal font-mono">turbo_v2.5</dd>
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
