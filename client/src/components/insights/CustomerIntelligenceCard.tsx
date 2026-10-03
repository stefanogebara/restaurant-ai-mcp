import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { useLTVAtRisk, useLTVTopVIPs, useSendCampaign } from '../../hooks/useLTVData';
import { usePlanFeature } from '../../hooks/usePlanFeature';
import { useToast } from '../../contexts/ToastContext';
import { parseLocalDate } from '../../utils/timeFormatting';
import type { Customer } from '../host/ltvDashboard.types';

function customerInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

interface SendModalProps {
  customer: Customer;
  onClose: () => void;
  appearance: 'default' | 'hero';
}

function SendModal({ customer, onClose, appearance }: SendModalProps) {
  const { t, i18n } = useTranslation();
  const hero = appearance === 'hero';
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
      <div className={`w-full max-w-md ${hero ? 'rounded-[22px] border border-brand-line bg-brand-paper shadow-xl' : 'glass-modal'}`} role="dialog" aria-modal="true" aria-labelledby="re-engagement-title">
        <div className={`flex items-center justify-between border-b p-5 ${hero ? 'border-brand-line' : 'border-glass-border-dark'}`}>
          <h3 id="re-engagement-title" className={hero ? 'font-brand text-2xl font-medium tracking-tight text-brand-ink' : 'font-serif text-2xl text-deep-charcoal'}>{t('insights.sendReEngagement')}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className={`transition-colors ${hero ? 'text-brand-muted hover:text-brand-ink' : 'text-warm-stone hover:text-deep-charcoal'}`}
          >
            <ThiingsIcon name="close" pxSize={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className={`flex items-center gap-3 border-b py-3 ${hero ? 'border-brand-line' : 'hairline'}`}>
            <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium ${hero ? 'bg-brand-action/10 text-brand-ink' : 'bg-soft-gray text-deep-charcoal'}`} aria-hidden="true">
              {customerInitials(customer.customer_name || customer.customer_id)}
            </div>
            <div>
              <div className={`text-sm font-semibold ${hero ? 'text-brand-ink' : 'text-deep-charcoal'}`}>{customer.customer_name || customer.customer_id}</div>
              <div className={`text-xs ${hero ? 'text-brand-muted' : 'text-muted-stone'}`}>{t('insights.estimatedChurnRisk', { score: customer.churn_risk_score })} · {t('insights.visits', { count: customer.total_visits })}</div>
            </div>
          </div>

          <div>
            <label htmlFor="re-engagement-msg" className={`mb-1.5 block text-xs font-semibold ${hero ? 'text-brand-ink' : 'text-deep-charcoal'}`}>
              {t('insights.message')}
            </label>
            <textarea
              id="re-engagement-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className={`w-full resize-none rounded-xl border p-3 text-sm focus:outline-none focus:ring-2 ${hero ? 'border-brand-line bg-brand-paper text-brand-ink focus:border-brand-action focus:ring-brand-action/25' : 'border-glass-border-input text-deep-charcoal focus:border-burgundy focus:ring-burgundy/30'}`}
            />
          </div>
        </div>

        <div className="p-5 pt-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-colors ${hero ? 'border-brand-line text-brand-ink hover:bg-brand-action/10' : 'border-glass-border-dark text-deep-charcoal hover:bg-soft-gray'}`}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={isPending || !message.trim()}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${hero ? 'bg-brand-action text-brand-paper hover:bg-brand-ink' : 'bg-burgundy text-white hover:bg-burgundy-dark'}`}
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
  appearance?: 'default' | 'hero';
}

function CustomerRow({ customer, showChurn, onSend, className = '', appearance = 'default' }: CustomerRowProps) {
  const { t, i18n } = useTranslation();
  const hero = appearance === 'hero';
  const localeMap: Record<string, string> = { 'pt-BR': 'pt-BR', es: 'es', en: 'en-US' };
  const dateLocale = localeMap[i18n.language] ?? 'en-US';
  const lastVisit = customer.last_visit_date
    ? parseLocalDate(customer.last_visit_date).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15px] font-medium ${hero ? 'text-brand-ink' : 'text-deep-charcoal'}`}>{customer.customer_name || customer.customer_id}</span>
        <span className={`mt-0.5 block text-[13px] ${hero ? 'text-brand-muted' : 'text-muted-stone'}`}>
          {t('insights.visits', { count: customer.total_visits })} · {t('insights.lastVisit', 'Last')}: {lastVisit}
        </span>
      </span>
      {showChurn && (
        <span className="shrink-0 text-right" aria-hidden="true">
          <span className="block text-[17px] font-medium tabular-nums text-ocre-700">{customer.churn_risk_score}{hero && <span className="ml-0.5 text-[12px]">/100</span>}</span>
        </span>
      )}
      {onSend && <ThiingsIcon name="chevron-right" pxSize={16} className={`shrink-0 ${hero ? 'text-brand-muted' : 'text-muted-stone'}`} />}
    </>
  );

  return onSend ? (
    <button
      type="button"
      onClick={() => onSend(customer)}
      aria-label={`${t('insights.reviewEmailFor', { name: customer.customer_name || customer.customer_id })} · ${t('insights.estimatedChurnRisk', { score: customer.churn_risk_score })}`}
      className={`flex w-full items-center gap-3 border-b py-3.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 last:border-0 ${hero ? 'border-brand-line hover:bg-brand-action/5 focus-visible:outline-brand-action' : 'hairline hover:bg-white/50 focus-visible:outline-burgundy'} ${className}`}
    >
      {content}
    </button>
  ) : (
    <div className={`flex items-center gap-3 border-b py-3.5 last:border-0 ${hero ? 'border-brand-line' : 'hairline'} ${className}`}>{content}</div>
  );
}

interface CustomerIntelligenceCardProps {
  appearance?: 'default' | 'hero';
}

export default function CustomerIntelligenceCard({ appearance = 'default' }: CustomerIntelligenceCardProps) {
  const { t } = useTranslation();
  const { hasAccess, isLoading: planLoading } = usePlanFeature('customerLTV');
  const { data: atRisk = [], isLoading: loadingAtRisk, isError: errorAtRisk } = useLTVAtRisk();
  const { data: vips = [], isLoading: loadingVIPs, isError: errorVIPs } = useLTVTopVIPs();
  const [sendTarget, setSendTarget] = useState<Customer | null>(null);
  const [tab, setTab] = useState<'at-risk' | 'vips'>('at-risk');
  const [showAllRisk, setShowAllRisk] = useState(false);

  const isLoading = planLoading || loadingAtRisk || loadingVIPs;
  const hero = appearance === 'hero';

  if (isLoading) {
    return (
      <div className="py-6" aria-busy="true">
        <div className={`mb-3 h-4 w-40 animate-pulse rounded ${hero ? 'bg-brand-line' : 'bg-soft-gray'}`} />
        <div className={`h-3 w-32 animate-pulse rounded ${hero ? 'bg-brand-line' : 'bg-soft-gray'}`} />
      </div>
    );
  }

  if (!hasAccess || errorAtRisk || errorVIPs) {
    return (
      <section className="min-w-0" aria-label={t('insights.customerIntelligence')}>
        <p className={`py-7 text-[15px] ${hero ? 'text-brand-muted' : 'text-muted-stone'}`}>
          {t(hasAccess ? 'insights.customerDataUnavailable' : 'insights.customerPlanUnavailable')}
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="min-w-0" aria-label={t('insights.customerIntelligence')}>
        {/* Tab switcher */}
        <div className={`flex items-end justify-between gap-4 border-b ${hero ? 'border-brand-line' : 'hairline'}`}>
          <div className="flex gap-6" role="tablist" aria-label={t('insights.customerIntelligence')}>
            {(['at-risk', 'vips'] as const).map((tabKey) => (
              <button
              key={tabKey}
              type="button"
              onClick={() => setTab(tabKey)}
              role="tab"
              aria-selected={tab === tabKey}
              className={`${hero ? 'py-2 sm:py-3' : 'py-3'} text-sm font-medium transition-colors ${
                tab === tabKey
                  ? hero ? 'text-brand-ink border-b-2 border-brand-action' : 'text-deep-charcoal border-b-2 border-deep-charcoal'
                  : hero ? 'text-brand-muted hover:text-brand-ink border-b-2 border-transparent' : 'text-muted-stone hover:text-deep-charcoal border-b-2 border-transparent'
              }`}
            >
                <span>{tabKey === 'at-risk' ? t(hero ? 'insights.featuredPriorities' : 'insights.priorityCustomers') : t('insights.vips')}</span>
                <span className="ml-1.5 tabular-nums">{tabKey === 'at-risk' ? atRisk.length : vips.length}</span>
              </button>
            ))}
          </div>
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
                {!hero && <p className="flex items-center justify-end pt-3 pb-1 text-xs text-muted-stone"><span>{t('insights.churnRiskColumn')}</span></p>}
                {(showAllRisk ? atRisk : atRisk.slice(0, 3)).map((c, index) => (
                  <CustomerRow key={c.customer_id} customer={c} showChurn onSend={setSendTarget} appearance={appearance} className={!showAllRisk && (hero ? index > 0 : index === 2) ? 'hidden sm:flex' : ''} />
                ))}
                {hero && atRisk.length > 1 && !showAllRisk && (
                  <button type="button" onClick={() => setShowAllRisk(true)} className="mt-6 text-[13px] font-medium text-brand-action hover:underline focus-visible:outline-2 focus-visible:outline-brand-action sm:hidden">
                    {t('insights.showMorePriorities', { count: atRisk.length - 1 })} <span aria-hidden="true">→</span>
                  </button>
                )}
                {hero && (showAllRisk || atRisk.length <= 1) && (
                  <Link to="/host-dashboard/customers" className="mt-3 inline-flex text-[13px] font-medium text-brand-action underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand-action sm:hidden">
                    {t('insights.viewAllCustomers')} <span aria-hidden="true" className="ml-1">↗</span>
                  </Link>
                )}
                {atRisk.length > 3 && !showAllRisk && (
                  <button type="button" onClick={() => setShowAllRisk(true)} className={`mt-3 text-[13px] font-medium hover:underline focus-visible:outline focus-visible:outline-2 ${hero ? 'hidden text-brand-action focus-visible:outline-brand-action sm:inline-flex' : 'text-burgundy focus-visible:outline-burgundy'}`}>
                    {t('insights.showAllRisk')} →
                  </button>
                )}
              </div>
            )
          )}

          {tab === 'vips' && (
            vips.length === 0 ? (
              <p className={`py-6 text-sm ${hero ? 'text-brand-muted' : 'text-muted-stone'}`}>{t('insights.noVipCustomers')}</p>
            ) : (
              <div>
                <p className={`pt-4 pb-1 text-xs ${hero ? 'text-brand-muted' : 'text-muted-stone'}`}>{t('insights.mostLoyalGuests')}</p>
                {vips.map((c) => (
                  <CustomerRow key={c.customer_id} customer={c} appearance={appearance} />
                ))}
              </div>
            )
          )}
        </div>
      </section>

      {sendTarget && (
        <SendModal customer={sendTarget} onClose={() => setSendTarget(null)} appearance={appearance} />
      )}
    </>
  );
}
