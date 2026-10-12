import { useTranslation } from 'react-i18next';
import type { CrmCustomer } from '../../hooks/useCustomers';
import { formatCurrency } from '../../utils/currency';
import CustomerTierBadge from './CustomerTierBadge';

interface CustomerMobileListProps {
  customers: CrmCustomer[];
  onSelect: (customerId: string) => void;
  formatLastVisit: (date: string | null) => string;
}

export default function CustomerMobileList({ customers, onSelect, formatLastVisit }: CustomerMobileListProps) {
  const { t } = useTranslation();

  return (
    <ul className="md:hidden divide-y divide-glass-border-dark">
      {customers.map((customer) => (
        <li key={customer.customer_id}>
          <button
            type="button"
            onClick={() => onSelect(customer.customer_id)}
            className="w-full px-4 py-4 text-left hover:bg-deep-charcoal/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-burgundy/50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-deep-charcoal break-words">
                  {customer.customer_name || customer.customer_phone}
                </p>
                {customer.customer_name && (
                  <p className="mt-0.5 font-mono text-xs text-muted-stone break-all">{customer.customer_phone}</p>
                )}
              </div>
              <CustomerTierBadge
                tier={customer.customer_tier as 'vip' | 'regular' | 'occasional' | 'new' | 'at_risk'}
                compact
              />
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2">
              <div className="min-w-0">
                <dt className="text-[11px] text-muted-stone">{t('crm.colVisits')}</dt>
                <dd className="mt-0.5 text-sm text-deep-charcoal tabular-nums">{customer.total_visits}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] text-muted-stone">{t('crm.colLastVisit')}</dt>
                <dd className="mt-0.5 text-sm text-deep-charcoal">{formatLastVisit(customer.last_visit_date)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] text-muted-stone break-words">{t('crm.colLTV')}</dt>
                <dd className="mt-0.5 text-sm text-deep-charcoal tabular-nums break-words">
                  {customer.lifetime_value ? formatCurrency(Math.round(customer.lifetime_value)) : '—'}
                </dd>
              </div>
            </dl>
            {customer.tags?.length > 0 && (
              <p className="mt-3 text-xs text-muted-stone truncate">{customer.tags.slice(0, 3).join(' · ')}</p>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
