import { useTranslation } from 'react-i18next';
import { useRevenueStats } from '../../hooks/useRevenueStats';
import { formatCurrency } from '../../utils/currency';
import ThiingsIcon from '../common/ThiingsIcon';

export default function RevenueByPartySizeWidget() {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useRevenueStats();

  if (isLoading) {
    return (
      <div className="p-6 animate-pulse space-y-3">
        <div className="h-4 bg-gray-100 rounded w-48" />
        <div className="h-8 bg-gray-100 rounded" />
      </div>
    );
  }

  const breakdown = stats?.by_party_size;
  if (!breakdown || breakdown.length === 0) return null;

  const maxAvg = Math.max(...breakdown.map((b) => b.avg_total), 1);

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[#111827] flex items-center gap-2">
        <ThiingsIcon name="users" pxSize={14} className="text-muted-stone" />
        {t('dashboard.revenueByPartySize', 'Revenue by Party Size')}
      </h2>

      <div className="space-y-3">
        {breakdown.map((b) => {
          const pct = Math.round((b.avg_total / maxAvg) * 100);
          return (
            <div key={b.range}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-warm-stone">
                  {b.range} {t('dashboard.guests', 'guests')}
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-stone">
                    {formatCurrency(b.avg_per_cover)}/{t('dashboard.cover', 'cover')}
                  </span>
                  <span className="font-semibold text-deep-charcoal min-w-[64px] text-right">
                    {formatCurrency(b.avg_total)}/{t('dashboard.table', 'table')}
                  </span>
                </div>
              </div>
              <div className="h-2 bg-soft-gray rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-400 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-stone">{b.count} {t('dashboard.services', 'services')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
