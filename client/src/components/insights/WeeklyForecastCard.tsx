import { useTranslation } from 'react-i18next';
import { useLTVStats } from '../../hooks/useLTVData';
import { formatCurrency } from '../../utils/currency';
import ThiingsIcon from '../common/ThiingsIcon';

interface StatRowProps {
  label: string;
  value: string | number;
}

function StatRow({ label, value }: StatRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b hairline py-4 last:border-0">
      <span className="text-[14px] text-muted-stone">{label}</span>
      <span className="shrink-0 text-right text-[15px] font-medium text-deep-charcoal">
        {value}
      </span>
    </div>
  );
}

export default function WeeklyForecastCard() {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useLTVStats();

  return (
    <section aria-labelledby="customer-health-heading" className="min-w-0">
      <header className="hidden h-[47px] items-center border-b hairline pt-2 sm:flex">
        <h3 id="customer-health-heading" className="font-sans text-[14px] font-medium leading-tight text-deep-charcoal">
          {t('insights.customerOverview')}
        </h3>
      </header>

      {isLoading ? (
        <div role="status" aria-label={t('common.loading')} className="border-y hairline py-7">
          <div className="grid grid-cols-3 gap-5" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index}>
                <div className="mb-3 h-8 w-10 animate-pulse rounded bg-border-gray" />
                <div className="h-3 w-16 max-w-full animate-pulse rounded bg-soft-gray" />
              </div>
            ))}
          </div>
        </div>
      ) : !stats ? (
        <p className="border-t hairline py-7 text-[15px] text-muted-stone">{t('insights.noCustomerData')}</p>
      ) : (
        <>
          <div className="border-y hairline py-4 sm:border-t-0 sm:py-5">
            <p className="max-w-[28ch] text-[19px] font-medium leading-snug tabular-nums text-deep-charcoal sm:text-[21px]">
              {t('insights.customerAtRiskCount', { risk: stats.high_risk_customers ?? 0, total: stats.total_customers ?? 0 })}
            </p>
            <div className="mt-3 h-[3px] w-full bg-deep-charcoal/10" role="img" aria-label={`${stats.high_risk_customers ?? 0} / ${stats.total_customers ?? 0} ${t('insights.customerAtRiskSummary')}`}>
              <div className="h-full bg-ocre-700" style={{ width: `${Math.min(100, Math.max(0, ((stats.high_risk_customers ?? 0) / (stats.total_customers || 1)) * 100))}%` }} />
            </div>
            <p className="mt-3 text-[12px] text-muted-stone">
              {t('insights.riskThresholdShort')}
              <span className="mx-2" aria-hidden="true">·</span>
              {stats.tiers?.vip ?? 0} {(stats.tiers?.vip ?? 0) === 1 ? t('insights.vipSingular') : t('insights.vips')}
              <span className="mx-2" aria-hidden="true">·</span>
              {stats.tiers?.regular ?? 0} {t('insights.regulars').toLowerCase()}
            </p>
          </div>

          <details className="group py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-medium text-deep-charcoal [&::-webkit-details-marker]:hidden">
              {t('insights.moreCustomerNumbers')}
              <ThiingsIcon name="chevron-down" pxSize={16} className="text-muted-stone transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2">
              <StatRow label={t('insights.totalCustomers')} value={stats.total_customers ?? 0} />
              <StatRow label={t('insights.avgLifetimeValue')} value={formatCurrency(stats.avg_ltv ?? 0)} />
              <StatRow label={t('insights.totalLtv')} value={formatCurrency(stats.total_ltv ?? 0)} />
            </div>
          </details>
        </>
      )}
    </section>
  );
}
