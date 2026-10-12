import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { formatCurrency } from './ltvHelpers';
import type { Customer } from './ltvDashboard.types';
import type { SupportedCurrency } from '../../utils/currency';

interface LTVTopVIPsProps {
  topVIPs: Customer[];
  currency: SupportedCurrency;
}

export default function LTVTopVIPs({ topVIPs, currency }: LTVTopVIPsProps) {
  const { t } = useTranslation();
  if (topVIPs.length === 0) return null;

  return (
    <section className="hairline pt-8">
      <div className="flex items-center gap-2 mb-3">
        <ThiingsIcon name="star" size="xs" />
        <h2 className="font-serif text-2xl text-deep-charcoal">{t('ltv.topVipTitle')}</h2>
      </div>
      <div className="space-y-2">
        {topVIPs.map((customer, index) => (
          <div key={customer.customer_id} className="flex flex-col gap-2 py-3 border-b hairline last:border-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-ocre-600/20 flex items-center justify-center">
                <span className="text-xs font-bold text-ocre-600">#{index + 1}</span>
              </div>
              <div>
                <div className="text-sm font-medium text-deep-charcoal">{customer.customer_name?.trim() || t('ltv.atRisk.anonymousGuest')}</div>
                <div className="text-xs text-stone-gray">{t('ltv.visitsCount', { count: customer.total_visits })}</div>
              </div>
            </div>
            <div className="pl-9 sm:pl-0 sm:text-right">
              <div className="text-sm font-medium text-deep-charcoal">{formatCurrency(customer.lifetime_value, currency)}</div>
              <div className="text-xs text-stone-gray">{t('ltv.estimatedFutureValue')}</div>
              <div className="text-xs text-stone-gray">{formatCurrency(customer.total_revenue, currency)} · {t('ltv.estimatedPastSpend')}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
