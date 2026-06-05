import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../common/ThiingsIcon';
import { useLTVStats } from '../../hooks/useLTVData';
import { formatCurrency } from '../../utils/currency';

interface StatRowProps {
  label: string;
  value: string | number;
  accent?: boolean;
}

function StatRow({ label, value, accent }: StatRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-glass-border-dark last:border-0">
      <span className="text-xs text-warm-stone">{label}</span>
      <span className={`text-sm font-semibold ${accent ? 'text-red-600' : 'text-deep-charcoal'}`}>{value}</span>
    </div>
  );
}

export default function WeeklyForecastCard() {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useLTVStats();

  if (isLoading) {
    return (
      <div className="py-6">
        <div className="h-4 w-40 bg-soft-gray rounded animate-pulse mb-3" />
        <div className="h-3 w-32 bg-soft-gray rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="border border-glass-border-dark rounded-lg overflow-hidden">
      <div className="p-5 border-b border-glass-border-dark flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
          <ThiingsIcon name="calendar" pxSize={16} className="text-purple-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-deep-charcoal">{t('insights.customerHealth')}</h2>
          <p className="text-xs text-warm-stone">{t('insights.loyaltyRetention')}</p>
        </div>
      </div>

      <div className="p-5">
        {!stats ? (
          <p className="text-sm text-warm-stone text-center py-4">{t('insights.noCustomerData')}</p>
        ) : (
          <>
            {/* Tier summary */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="text-center p-3 bg-amber-50 rounded-xl border border-amber-100">
                <div className="text-xl font-bold text-amber-700">{stats.tiers?.vip ?? 0}</div>
                <div className="text-xs text-amber-600 font-medium">{t('insights.vips')}</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-xl border border-blue-100">
                <div className="text-xl font-bold text-blue-700">{stats.tiers?.regular ?? 0}</div>
                <div className="text-xs text-blue-600 font-medium">{t('insights.regulars')}</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-xl border border-red-100">
                <div className="text-xl font-bold text-red-600">{stats.high_risk_customers ?? 0}</div>
                <div className="text-xs text-red-500 font-medium">{t('insights.atRisk')}</div>
              </div>
            </div>

            <div className="space-y-0">
              {/* Guard numeric fields with ?? 0 — a partial stats payload would
                  otherwise render "R$ NaN" via formatCurrency(undefined). */}
              <StatRow label={t('insights.totalCustomers')} value={stats.total_customers ?? 0} />
              <StatRow label={t('insights.avgLifetimeValue')} value={formatCurrency(stats.avg_ltv ?? 0)} />
              <StatRow label={t('insights.totalLtv')} value={formatCurrency(stats.total_ltv ?? 0)} />
              <StatRow
                label={t('insights.highChurnRisk')}
                value={(stats.high_risk_customers ?? 0) > 0 ? `${stats.high_risk_customers} ${t('insights.customers')}` : t('insights.none')}
                accent={(stats.high_risk_customers ?? 0) > 0}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
