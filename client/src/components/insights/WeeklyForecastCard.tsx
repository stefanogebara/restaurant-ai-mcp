import { useTranslation } from 'react-i18next';
import { useLTVStats } from '../../hooks/useLTVData';
import { usePlanFeature } from '../../hooks/usePlanFeature';
import { formatCurrency } from '../../utils/currency';
import ThiingsIcon from '../common/ThiingsIcon';

interface StatRowProps {
  label: string;
  value: string | number;
  appearance?: 'default' | 'hero';
}

function StatRow({ label, value, appearance = 'default' }: StatRowProps) {
  const hero = appearance === 'hero';
  return (
    <div className={`flex items-baseline justify-between gap-4 border-b py-4 last:border-0 ${hero ? 'border-brand-line' : 'hairline'}`}>
      <span className={`text-[14px] ${hero ? 'text-brand-muted' : 'text-muted-stone'}`}>{label}</span>
      <span className={`shrink-0 text-right text-[15px] font-medium ${hero ? 'text-brand-ink' : 'text-deep-charcoal'}`}>
        {value}
      </span>
    </div>
  );
}

interface WeeklyForecastCardProps {
  appearance?: 'default' | 'hero';
}

export default function WeeklyForecastCard({ appearance = 'default' }: WeeklyForecastCardProps) {
  const { t } = useTranslation();
  const { hasAccess, isLoading: planLoading } = usePlanFeature('customerLTV');
  const { data: stats, isLoading, isError } = useLTVStats();
  const hero = appearance === 'hero';

  return (
    <section aria-labelledby="customer-health-heading" className="min-w-0">
      <header className={`hidden h-[47px] items-center border-b pt-2 sm:flex ${hero ? 'border-brand-line' : 'hairline'}`}>
        <h3 id="customer-health-heading" className={`text-[14px] font-medium leading-tight ${hero ? 'font-brand text-brand-ink' : 'font-sans text-deep-charcoal'}`}>
          {t(hero ? 'insights.customerBase' : 'insights.customerOverview')}
        </h3>
      </header>

      {isLoading || planLoading ? (
        <div role="status" aria-label={t('common.loading')} className={`border-y py-7 ${hero ? 'border-brand-line' : 'hairline'}`}>
          <div className="grid grid-cols-3 gap-5" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index}>
                <div className={`mb-3 h-8 w-10 animate-pulse rounded ${hero ? 'bg-brand-line' : 'bg-border-gray'}`} />
                <div className={`h-3 w-16 max-w-full animate-pulse rounded ${hero ? 'bg-brand-line' : 'bg-soft-gray'}`} />
              </div>
            ))}
          </div>
        </div>
      ) : !hasAccess ? (
        <p className={`border-t py-7 text-[15px] ${hero ? 'border-brand-line text-brand-muted' : 'hairline text-muted-stone'}`}>{t('insights.customerPlanUnavailable')}</p>
      ) : isError ? (
        <p className={`border-t py-7 text-[15px] ${hero ? 'border-brand-line text-brand-muted' : 'hairline text-muted-stone'}`}>{t('insights.customerDataUnavailable')}</p>
      ) : !stats ? (
        <p className={`border-t py-7 text-[15px] ${hero ? 'border-brand-line text-brand-muted' : 'hairline text-muted-stone'}`}>{t('insights.noCustomerData')}</p>
      ) : (
        <>
          <div className={`border-y py-4 sm:border-t-0 sm:py-5 ${hero ? 'border-brand-line' : 'hairline'}`}>
            {hero ? (
              <>
                <dl className="grid grid-cols-3 gap-3 font-brand text-brand-ink">
                  <div className="flex min-w-0 flex-col-reverse justify-end gap-1">
                    <dt className="text-[12px] text-brand-muted">{t('insights.customerSection')}</dt>
                    <dd className="m-0 text-[32px] font-medium leading-none tracking-[-0.05em] tabular-nums">{stats.total_customers ?? 0}</dd>
                  </div>
                  <div className="flex min-w-0 flex-col-reverse justify-end gap-1">
                    <dt className="text-[12px] text-brand-muted">{t('insights.vips')}</dt>
                    <dd className="m-0 text-[32px] font-medium leading-none tracking-[-0.05em] tabular-nums">{stats.tiers?.vip ?? 0}</dd>
                  </div>
                  <div className="flex min-w-0 flex-col-reverse justify-end gap-1">
                    <dt className="text-[12px] text-brand-muted">{t('insights.regulars')}</dt>
                    <dd className="m-0 text-[32px] font-medium leading-none tracking-[-0.05em] tabular-nums">{stats.tiers?.regular ?? 0}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="max-w-[28ch] text-[19px] font-medium leading-snug tabular-nums text-deep-charcoal sm:text-[21px]">
                {t('insights.customerAtRiskCount', { risk: stats.high_risk_customers ?? 0, total: stats.total_customers ?? 0 })}
              </p>
            )}
            {!hero && <div className="mt-3 h-[3px] w-full bg-deep-charcoal/10" role="img" aria-label={`${stats.high_risk_customers ?? 0} / ${stats.total_customers ?? 0} ${t('insights.customerAtRiskSummary')}`}>
              <div className="h-full bg-ocre-700" style={{ width: `${Math.min(100, Math.max(0, ((stats.high_risk_customers ?? 0) / (stats.total_customers || 1)) * 100))}%` }} />
            </div>}
            {!hero && <p className="mt-3 text-[12px] text-muted-stone">
              {t('insights.riskThresholdShort')}
              <span className="mx-2" aria-hidden="true">·</span>
              {stats.tiers?.vip ?? 0} {(stats.tiers?.vip ?? 0) === 1 ? t('insights.vipSingular') : t('insights.vips')}
              <span className="mx-2" aria-hidden="true">·</span>
              {stats.tiers?.regular ?? 0} {t('insights.regulars').toLowerCase()}
            </p>}
          </div>

          <details className="group py-3">
            <summary className={`flex cursor-pointer list-none items-center justify-between text-[13px] font-medium [&::-webkit-details-marker]:hidden ${hero ? 'text-brand-ink' : 'text-deep-charcoal'}`}>
              {t('insights.moreCustomerNumbers')}
              <ThiingsIcon name="chevron-down" pxSize={16} className={`transition-transform group-open:rotate-180 ${hero ? 'text-brand-muted' : 'text-muted-stone'}`} />
            </summary>
            <div className="mt-2">
              <StatRow label={t('insights.totalCustomers')} value={stats.total_customers ?? 0} appearance={appearance} />
              <StatRow label={t('insights.avgLifetimeValue')} value={formatCurrency(stats.avg_ltv ?? 0)} appearance={appearance} />
              <StatRow label={t('insights.totalLtv')} value={formatCurrency(stats.total_ltv ?? 0)} appearance={appearance} />
            </div>
          </details>
        </>
      )}
    </section>
  );
}
