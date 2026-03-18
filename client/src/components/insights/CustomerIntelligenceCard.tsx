import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { useLTVAtRisk, useLTVTopVIPs, useSendCampaign } from '../../hooks/useLTVData';
import { useToast } from '../../contexts/ToastContext';
import type { Customer } from '../host/ltvDashboard.types';

const RE_ENGAGEMENT_MESSAGE =
  "We miss you! It's been a while and we'd love to welcome you back. Enjoy a complimentary welcome drink on your next visit.";

interface SendModalProps {
  customer: Customer;
  onClose: () => void;
}

function SendModal({ customer, onClose }: SendModalProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState(RE_ENGAGEMENT_MESSAGE);
  const { mutate: sendCampaign, isPending } = useSendCampaign();
  const toast = useToast();

  const handleSend = () => {
    sendCampaign(
      { customerId: customer.customer_id, campaignType: 'win_back', message },
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-border-gray">
        <div className="p-5 border-b border-border-gray flex items-center justify-between">
          <h3 className="text-sm font-semibold text-deep-charcoal">{t('insights.sendReEngagement')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-warm-stone hover:text-deep-charcoal transition-colors"
          >
            <ThiingsIcon name="close" pxSize={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-soft-gray rounded-xl">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-burgundy to-rose-700 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-deep-charcoal">{customer.customer_name || customer.customer_id}</div>
              <div className="text-xs text-warm-stone">{t('insights.churnRisk', { score: customer.churn_risk_score })} · {t('insights.visits', { count: customer.total_visits })}</div>
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
              className="w-full text-sm text-deep-charcoal border border-border-gray rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy"
            />
          </div>
        </div>

        <div className="p-5 pt-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-border-gray text-deep-charcoal text-sm font-semibold rounded-xl hover:bg-soft-gray transition-colors"
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
}

function CustomerRow({ customer, showChurn, onSend }: CustomerRowProps) {
  const { t, i18n } = useTranslation();
  const churnColor =
    customer.churn_risk_score >= 80
      ? 'text-red-600'
      : customer.churn_risk_score >= 60
      ? 'text-amber-600'
      : 'text-warm-stone';

  const localeMap: Record<string, string> = { 'pt-BR': 'pt-BR', es: 'es', en: 'en-US' };
  const dateLocale = localeMap[i18n.language] ?? 'en-US';
  const lastVisit = customer.last_visit_date
    ? new Date(customer.last_visit_date).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })
    : '—';

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border-gray last:border-0">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-stone-200 to-stone-300 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-deep-charcoal truncate">{customer.customer_name || customer.customer_id}</div>
        <div className="text-xs text-warm-stone">{t('insights.visits', { count: customer.total_visits })} · {t('insights.lastVisit', 'Last')}: {lastVisit}</div>
      </div>
      {showChurn && (
        <span className={`text-xs font-semibold flex-shrink-0 ${churnColor}`}>
          {customer.churn_risk_score}%
        </span>
      )}
      {onSend && (
        <button
          type="button"
          onClick={() => onSend(customer)}
          className="flex-shrink-0 px-2.5 py-1 text-xs font-semibold text-burgundy border border-burgundy/30 rounded-lg hover:bg-burgundy hover:text-white transition-colors"
        >
          {t('insights.send')}
        </button>
      )}
    </div>
  );
}

export default function CustomerIntelligenceCard() {
  const { t } = useTranslation();
  const { data: atRisk = [], isLoading: loadingAtRisk } = useLTVAtRisk();
  const { data: vips = [], isLoading: loadingVIPs } = useLTVTopVIPs();
  const [sendTarget, setSendTarget] = useState<Customer | null>(null);
  const [tab, setTab] = useState<'at-risk' | 'vips'>('at-risk');

  const isLoading = loadingAtRisk || loadingVIPs;

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray/50 rounded-2xl p-6 shadow-sm">
        <div className="h-4 w-40 bg-soft-gray rounded animate-pulse mb-3" />
        <div className="h-3 w-32 bg-soft-gray rounded animate-pulse" />
      </div>
    );
  }

  return (
    <>
      <div className="bg-white border border-border-gray/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-border-gray flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
            <ThiingsIcon name="user" pxSize={16} className="text-rose-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-deep-charcoal">{t('insights.customerIntelligence')}</h2>
            <p className="text-xs text-warm-stone">{t('insights.atRiskAndVip')}</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-border-gray">
          {(['at-risk', 'vips'] as const).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setTab(tabKey)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                tab === tabKey
                  ? 'text-burgundy border-b-2 border-burgundy bg-burgundy/5'
                  : 'text-warm-stone hover:text-deep-charcoal'
              }`}
            >
              {tabKey === 'at-risk' ? `${t('insights.atRisk')} (${atRisk.length})` : `${t('insights.vips')} (${vips.length})`}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'at-risk' && (
            atRisk.length === 0 ? (
              <div className="flex items-center gap-2 py-3 px-4 bg-rose-500/8 rounded-xl border border-rose-500/20">
                <ThiingsIcon name="check-circle" pxSize={16} className="text-rose-600 flex-shrink-0" />
                <span className="text-sm text-rose-700 font-medium">{t('insights.noHighRiskCustomers')}</span>
              </div>
            ) : (
              <div>
                <p className="text-xs text-warm-stone mb-3">{t('insights.churnRiskHint')}</p>
                {atRisk.map((c) => (
                  <CustomerRow key={c.customer_id} customer={c} showChurn onSend={setSendTarget} />
                ))}
              </div>
            )
          )}

          {tab === 'vips' && (
            vips.length === 0 ? (
              <p className="text-sm text-warm-stone text-center py-4">{t('insights.noVipCustomers')}</p>
            ) : (
              <div>
                <p className="text-xs text-warm-stone mb-3">{t('insights.mostLoyalGuests')}</p>
                {vips.map((c) => (
                  <CustomerRow key={c.customer_id} customer={c} />
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {sendTarget && (
        <SendModal customer={sendTarget} onClose={() => setSendTarget(null)} />
      )}
    </>
  );
}
