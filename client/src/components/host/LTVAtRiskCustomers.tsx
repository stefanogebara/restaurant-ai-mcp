import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { formatCurrency } from './ltvHelpers';
import type { Customer } from './ltvDashboard.types';

interface LTVAtRiskCustomersProps {
  atRiskCustomers: Customer[];
  highRiskCount: number;
  onOpenCampaignModal: (customer: Customer) => void;
}

/**
 * Used to read "Last: <date> · {n} visits · {amount} LTV" with the customer's
 * internal database id where their name should be. Now uses `customer_name`
 * with a graceful fallback, and uses host-friendly language ("Total spent",
 * "Haven't seen them in a while") instead of analytics jargon ("LTV", "Churn
 * Risk").
 */
export default function LTVAtRiskCustomers({ atRiskCustomers, highRiskCount, onOpenCampaignModal }: LTVAtRiskCustomersProps) {
  const { t, i18n } = useTranslation();

  if (atRiskCustomers.length === 0) return null;

  const formatLastVisit = (iso: string): string => {
    if (!iso) return t('ltv.atRisk.unknown', 'Unknown');
    try {
      return new Date(iso).toLocaleDateString(i18n.language || undefined);
    } catch {
      return iso;
    }
  };

  return (
    <div className="p-4 bg-amber-600/10 rounded-xl border border-amber-600/20">
      <div className="flex items-center gap-2 mb-3">
        <ThiingsIcon name="alert-triangle" size="xs" />
        <h3 className="text-sm font-semibold text-deep-charcoal">
          {t('ltv.atRisk.heading', "Haven't seen them in a while")}{' '}
          <span className="text-stone-600 font-normal">({highRiskCount})</span>
        </h3>
      </div>
      <div className="space-y-2">
        {atRiskCustomers.map((customer) => {
          const displayName = customer.customer_name?.trim() || t('ltv.atRisk.anonymousGuest', 'Anonymous guest');
          return (
            <div key={customer.customer_id} className="flex items-center justify-between p-2 bg-white/50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <ThiingsIcon name="trending-down" size="xs" />
                </div>
                <div>
                  <div className="text-sm font-medium text-deep-charcoal">{displayName}</div>
                  <div className="text-xs text-stone-gray flex items-center gap-1">
                    <ThiingsIcon name="calendar" pxSize={12} />
                    {t('ltv.atRisk.lastVisit', 'Last visit')}: {formatLastVisit(customer.last_visit_date)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-sm font-bold text-deep-charcoal">
                    {formatCurrency(customer.lifetime_value)}
                  </div>
                  <div className="text-xs text-stone-gray">
                    {t('ltv.atRisk.visitsCount', '{{count}} visits', { count: customer.total_visits })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenCampaignModal(customer)}
                  aria-label={t('ltv.atRisk.sendWinBack', 'Send a win-back message')}
                  title={t('ltv.atRisk.sendWinBack', 'Send a win-back message')}
                  className="p-2 bg-amber-600/20 hover:bg-amber-600/30 rounded-xl transition-colors"
                >
                  <ThiingsIcon name="mail" size="xs" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="w-full mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-xl transition-colors"
        onClick={() => atRiskCustomers[0] && onOpenCampaignModal(atRiskCustomers[0])}
      >
        {t('ltv.atRisk.launchCampaign', 'Send win-back message to everyone')}
      </button>
    </div>
  );
}
