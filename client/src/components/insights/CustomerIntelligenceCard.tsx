import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { useLTVAtRisk, useLTVTopVIPs, useSendCampaign } from '../../hooks/useLTVData';
import { useToast } from '../../contexts/ToastContext';
import { parseLocalDate } from '../../utils/timeFormatting';
import type { Customer } from '../host/ltvDashboard.types';

function customerInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

interface SendModalProps {
  customer: Customer;
  onClose: () => void;
}

function SendModal({ customer, onClose }: SendModalProps) {
  const { t, i18n } = useTranslation();
  const [message, setMessage] = useState(() => t('insights.reEngagementDraft'));
  const { mutate: sendCampaign, isPending } = useSendCampaign();
  const toast = useToast();

  const handleSend = () => {
    sendCampaign(
      { customerId: customer.customer_id, campaignType: 'win_back', message, language: i18n.language },
      {
        onSuccess: () => {
          toast.success(t('insights.reEngagementSent', 'Re-engagement message sent'));
          onClose();
        },
        onError: (err) => {
          toast.error(err.message || t('insights.reEngagementFailed', 'Failed to send message'));
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="glass-modal w-full max-w-md" role="dialog" aria-modal="true" aria-labelledby="re-engagement-title">
        <div className="p-5 border-b border-glass-border-dark flex items-center justify-between">
          <h3 id="re-engagement-title" className="font-serif text-2xl text-deep-charcoal">{t('insights.sendReEngagement')}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-warm-stone hover:text-deep-charcoal transition-colors"
          >
            <ThiingsIcon name="close" pxSize={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 py-3 border-b hairline">
            <div className="w-9 h-9 rounded-full bg-soft-gray text-deep-charcoal flex items-center justify-center flex-shrink-0 text-xs font-medium" aria-hidden="true">
              {customerInitials(customer.customer_name || customer.customer_id)}
            </div>
            <div>
              <div className="text-sm font-semibold text-deep-charcoal">{customer.customer_name || customer.customer_id}</div>
              <div className="text-xs text-muted-stone">{t('insights.estimatedChurnRisk', { score: customer.churn_risk_score })} · {t('insights.visits', { count: customer.total_visits })}</div>
            </div>
          </div>

          <div>
            <label htmlFor="re-engagement-msg" className="text-xs font-semibold text-deep-charcoal block mb-1.5">
              {t('insights.message')}
            </label>
            <textarea
              id="re-engagement-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full text-sm text-deep-charcoal border border-glass-border-input rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
            />
          </div>
        </div>

        <div className="p-5 pt-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-glass-border-dark text-deep-charcoal text-sm font-semibold rounded-xl hover:bg-soft-gray transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={isPending || !message.trim()}
            className="flex-1 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {isPending ? t('insights.sending') : t('insights.sendEmail')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CustomerRowProps {
  customer: Customer;
  showChurn?: boolean;
  onSend?: (c: Customer) => void;
  className?: string;
}

function CustomerRow({ customer, showChurn, onSend, className = '' }: CustomerRowProps) {
  const { t, i18n } = useTranslation();
  const localeMap: Record<string, string> = { 'pt-BR': 'pt-BR', es: 'es', en: 'en-US' };
  const dateLocale = localeMap[i18n.language] ?? 'en-US';
  const lastVisit = customer.last_visit_date
    ? parseLocalDate(customer.last_visit_date).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-deep-charcoal">{customer.customer_name || customer.customer_id}</span>
        <span className="mt-0.5 block text-[13px] text-muted-stone">
          {t('insights.visits', { count: customer.total_visits })} · {t('insights.lastVisit', 'Last')}: {lastVisit}
        </span>
      </span>
      {showChurn && (
        <span className="shrink-0 text-right" aria-hidden="true">
          <span className="block text-[17px] font-medium tabular-nums text-ocre-700">{customer.churn_risk_score}</span>
        </span>
      )}
      {onSend && <ThiingsIcon name="chevron-right" pxSize={16} className="shrink-0 text-muted-stone" />}
    </>
  );

  return onSend ? (
    <button
      type="button"
      onClick={() => onSend(customer)}
      aria-label={`${t('insights.reviewEmailFor', { name: customer.customer_name || customer.customer_id })} · ${t('insights.estimatedChurnRisk', { score: customer.churn_risk_score })}`}
      className={`hairline flex w-full items-center gap-3 border-b py-3.5 text-left transition-colors hover:bg-white/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-burgundy last:border-0 ${className}`}
    >
      {content}
    </button>
  ) : (
    <div className={`hairline flex items-center gap-3 border-b py-3.5 last:border-0 ${className}`}>{content}</div>
  );
}

export default function CustomerIntelligenceCard() {
  const { t } = useTranslation();
  const { data: atRisk = [], isLoading: loadingAtRisk } = useLTVAtRisk();
  const { data: vips = [], isLoading: loadingVIPs } = useLTVTopVIPs();
  const [sendTarget, setSendTarget] = useState<Customer | null>(null);
  const [tab, setTab] = useState<'at-risk' | 'vips'>('at-risk');
  const [showAllRisk, setShowAllRisk] = useState(false);

  const isLoading = loadingAtRisk || loadingVIPs;

  if (isLoading) {
    return (
      <div className="py-6">
        <div className="h-4 w-40 bg-soft-gray rounded animate-pulse mb-3" />
        <div className="h-3 w-32 bg-soft-gray rounded animate-pulse" />
      </div>
    );
  }

  return (
    <>
      <section className="min-w-0" aria-label={t('insights.customerIntelligence')}>
        {/* Tab switcher */}
        <div className="flex gap-6 border-b hairline" role="tablist" aria-label={t('insights.customerIntelligence')}>
          {(['at-risk', 'vips'] as const).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setTab(tabKey)}
              role="tab"
              aria-selected={tab === tabKey}
              className={`py-3 text-sm font-medium transition-colors ${
                tab === tabKey
                  ? 'text-deep-charcoal border-b-2 border-deep-charcoal'
                  : 'text-muted-stone hover:text-deep-charcoal border-b-2 border-transparent'
              }`}
            >
              {tabKey === 'at-risk' ? `${t('insights.priorityCustomers')} · ${atRisk.length}` : `${t('insights.vips')} · ${vips.length}`}
            </button>
          ))}
        </div>

        <div>
          {tab === 'at-risk' && (
            atRisk.length === 0 ? (
              <div className="flex items-center gap-2 py-6">
                <ThiingsIcon name="check-circle" pxSize={16} className="text-emerald-600 flex-shrink-0" />
                <span className="text-sm text-emerald-700 font-medium">{t('insights.noHighRiskCustomers')}</span>
              </div>
            ) : (
              <div>
                <p className="flex items-center justify-end pt-3 pb-1 text-xs text-muted-stone">
                  <span>{t('insights.churnRiskColumn')}</span>
                </p>
                {(showAllRisk ? atRisk : atRisk.slice(0, 3)).map((c, index) => (
                  <CustomerRow key={c.customer_id} customer={c} showChurn onSend={setSendTarget} className={!showAllRisk && index === 2 ? 'hidden sm:flex' : ''} />
                ))}
                {atRisk.length > 3 && !showAllRisk && (
                  <button type="button" onClick={() => setShowAllRisk(true)} className="mt-3 text-[13px] font-medium text-burgundy hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-burgundy">
                    {t('insights.showAllRisk')} →
                  </button>
                )}
              </div>
            )
          )}

          {tab === 'vips' && (
            vips.length === 0 ? (
              <p className="text-sm text-muted-stone py-6">{t('insights.noVipCustomers')}</p>
            ) : (
              <div>
                <p className="text-xs text-muted-stone pt-4 pb-1">{t('insights.mostLoyalGuests')}</p>
                {vips.map((c) => (
                  <CustomerRow key={c.customer_id} customer={c} />
                ))}
              </div>
            )
          )}
        </div>
      </section>

      {sendTarget && (
        <SendModal customer={sendTarget} onClose={() => setSendTarget(null)} />
      )}
    </>
  );
}
