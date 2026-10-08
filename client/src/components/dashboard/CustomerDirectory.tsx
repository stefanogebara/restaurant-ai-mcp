import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/currency';
import type { CrmCustomer } from '../../hooks/useCustomers';

interface CustomerDirectoryProps {
  customers: CrmCustomer[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onOpen: (customerId: string) => void;
  selectedCustomerId?: string | null;
}

function relativeVisit(date: string | null, locale: string, unknownLabel: string): string {
  if (!date) return unknownLabel;
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return unknownLabel;
  const elapsedDays = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'long' });
  if (elapsedDays < 7) return formatter.format(-elapsedDays, 'day');
  if (elapsedDays < 30) return formatter.format(-Math.floor(elapsedDays / 7), 'week');
  if (elapsedDays < 365) return formatter.format(-Math.floor(elapsedDays / 30), 'month');
  return formatter.format(-Math.floor(elapsedDays / 365), 'year');
}

export default function CustomerDirectory({
  customers, total, page, pageSize, onPageChange, onOpen, selectedCustomerId,
}: CustomerDirectoryProps) {
  const { t, i18n } = useTranslation();
  const totalPages = Math.ceil(total / pageSize);
  const compact = !!selectedCustomerId;

  return (
    <section aria-label={t('crm.directoryLabel', 'Customer directory')}>
      <div className={`flex justify-between border-b border-brand-line px-3 pb-3 text-[11px] font-medium text-brand-muted md:grid md:gap-4 md:px-4 ${compact ? 'md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_120px_90px]' : 'md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.25fr)_140px_110px]'}`}>
        <span>{t('crm.colName', 'Customer')}</span>
        <span className="hidden md:block">{t('crm.historyLabel', 'History')}</span>
        <span className="hidden text-right md:block">{t('crm.estimatedValue', 'Estimated value')}</span>
        <span className="text-right">{t('crm.riskShort', 'Risk')}</span>
      </div>
      <ol className="divide-y divide-brand-line">
        {customers.map((customer) => {
          const name = customer.customer_name || customer.customer_phone;
          const visit = relativeVisit(customer.last_visit_date, i18n.language, t('crm.visitUnknown', 'Date unavailable'));
          const score = Math.round(customer.churn_risk_score || 0);
          return (
            <li key={customer.customer_id}>
              <button
                type="button"
                onClick={() => onOpen(customer.customer_id)}
                aria-label={t('crm.openCustomer', { name, defaultValue: `Open ${name}` })}
                aria-current={selectedCustomerId === customer.customer_id ? 'true' : undefined}
                className={`group grid min-h-[80px] w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-l-[3px] px-3 py-3 text-left transition-colors hover:bg-brand-ink/[0.035] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-action md:items-center md:gap-4 md:px-4 ${compact ? 'md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_120px_90px]' : 'md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.25fr)_140px_110px]'} ${selectedCustomerId === customer.customer_id ? 'border-brand-action bg-brand-action/[0.07]' : 'border-transparent'}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[18px] font-medium leading-6 tracking-[-0.025em] text-brand-ink">{name}</span>
                  <span className="mt-1 block min-h-[16px] truncate text-xs leading-4 text-brand-muted">
                    {customer.customer_tier !== 'at_risk' && <span className="text-brand-ink/75">{t(`crm.tier_${customer.customer_tier}`, customer.customer_tier)}</span>}
                    {customer.customer_tier !== 'at_risk' && (customer.tags || []).length > 0 && ' · '}
                    {(customer.tags || []).slice(0, 3).join(' · ')}
                    {(customer.tags || []).length > 3 && ` · +${customer.tags.length - 3}`}
                  </span>
                </span>
                <span className="col-start-1 row-start-2 text-xs leading-5 text-brand-muted md:col-start-2 md:row-start-1">
                  <span className="font-medium text-brand-ink tabular-nums md:block md:text-sm">{t('crm.visitCount', { count: customer.total_visits, defaultValue: `${customer.total_visits} visits` })}</span>
                  <span aria-hidden="true" className="px-1 md:hidden">·</span>
                  <span className="md:block">{visit}</span>
                </span>
                <span className="col-start-1 row-start-3 text-xs tabular-nums text-brand-muted md:col-start-3 md:row-start-1 md:text-right md:text-[16px] md:font-medium md:text-brand-ink">
                  <span className="md:hidden">{t('crm.estimatedValue', 'Estimated value')}: </span>
                  <span className="text-brand-ink">{formatCurrency(Math.round(customer.lifetime_value || 0))}</span>
                </span>
                <span className="col-start-2 row-start-1 self-start text-right md:col-start-4 md:self-center">
                  <span aria-describedby="customer-score-explanation" className={`block text-[22px] leading-none tabular-nums tracking-[-0.04em] ${score >= 60 ? 'text-ocre-700' : score >= 40 ? 'text-brand-ink' : 'text-brand-muted'}`}>{score}<span className="ml-0.5 text-[11px] tracking-normal text-brand-muted">/100</span></span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {totalPages > 1 && (
        <nav aria-label={t('crm.paginationLabel', 'Customer pages')} className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-line px-4 py-4">
          <p className="text-xs tabular-nums text-brand-muted">
            {t('crm.showing', {
              from: page * pageSize + 1,
              to: Math.min((page + 1) * pageSize, total),
              total,
              defaultValue: 'Showing {{from}}-{{to}} of {{total}}',
            })}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onPageChange(Math.max(0, page - 1))} disabled={page === 0} className="rounded-full border border-brand-line px-4 py-2 text-xs text-brand-ink hover:bg-brand-ink/[0.04] disabled:opacity-40">
              {t('crm.prev', 'Previous')}
            </button>
            <button type="button" onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="rounded-full border border-brand-line px-4 py-2 text-xs text-brand-ink hover:bg-brand-ink/[0.04] disabled:opacity-40">
              {t('crm.next', 'Next')}
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
