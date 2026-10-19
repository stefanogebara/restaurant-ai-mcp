import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { formatCurrency } from './ltvHelpers';
import { parseLocalDate } from '../../utils/timeFormatting';
import type { Customer } from './ltvDashboard.types';
import type { SupportedCurrency } from '../../utils/currency';

interface LTVAtRiskCustomersProps {
  atRiskCustomers: Customer[];
  highRiskCount: number;
  currency: SupportedCurrency;
  onOpenCampaignModal: (customer: Customer) => void;
}

/** Shows one guest's estimated value and opens a review step, never a bulk send. */
export default function LTVAtRiskCustomers({ atRiskCustomers, highRiskCount, currency, onOpenCampaignModal }: LTVAtRiskCustomersProps) {
  const { t, i18n } = useTranslation();

  if (atRiskCustomers.length === 0) return null;

  const formatLastVisit = (iso: string): string => {
    if (!iso) return t('ltv.atRisk.unknown', 'Unknown');
    try {
      return parseLocalDate(iso).toLocaleDateString(i18n.language || undefined);
    } catch {
      return iso;
    }
  };

  return (
    <section className="hairline pt-8">
      <div className="flex items-center gap-2 mb-3">
        <ThiingsIcon name="alert-triangle" size="xs" />
        <h2 className="font-serif text-2xl text-deep-charcoal">
          {t('ltv.atRisk.heading', "Haven't seen them in a while")}{' '}
          <span className="text-muted-stone">({highRiskCount})</span>
        </h2>
      </div>
      <div className="space-y-2">
        {atRiskCustomers.map((customer) => {
          const displayName = customer.customer_name?.trim() || t('ltv.atRisk.anonymousGuest', 'Anonymous guest');
          return (
            <div key={customer.customer_id} className="border-b hairline py-3 last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-deep-charcoal">{displayName}</div>
                  <div className="text-xs text-stone-gray">
                    {t('ltv.atRisk.lastVisit', 'Last visit')}: {formatLastVisit(customer.last_visit_date)}
                  </div>
                  <div className="text-xs text-stone-gray">
                    {t('ltv.atRisk.visitsCount', '{{count}} visits', { count: customer.total_visits })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenCampaignModal(customer)}
                  aria-label={t('ltv.atRisk.prepareMessage')}
                  title={t('ltv.atRisk.prepareMessage')}
                  className="shrink-0 rounded-full bg-burgundy p-2.5 text-white hover:bg-burgundy/90 transition-colors"
                >
                  <ThiingsIcon name="mail" size="xs" />
                </button>
              </div>
              <p className="mt-1 text-sm font-medium text-deep-charcoal">
                {formatCurrency(customer.lifetime_value, currency)} <span className="text-xs font-normal text-muted-stone">· {t('ltv.estimatedFutureValue')}</span>
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-stone">{t('ltv.atRisk.reviewHint')}</p>
    </section>
  );
}
