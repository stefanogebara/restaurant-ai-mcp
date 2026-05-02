import { useTranslation } from 'react-i18next';
import { useRevenueStats } from '../../hooks/useRevenueStats';
import { useStaffingForecast } from '../../hooks/useStaffingForecast';
import { useRestaurantCurrency } from '../../hooks/useRestaurantCurrency';
import { formatCurrency } from '../../utils/currency';

export default function RevenueStatsWidget() {
  const { t, i18n } = useTranslation();
  // Currency from restaurant.country — multi-country safe.
  const currency = useRestaurantCurrency();
  const { data: stats, isLoading: statsLoading } = useRevenueStats();
  const { data: forecast, isLoading: forecastLoading } = useStaffingForecast();

  if (statsLoading || forecastLoading) {
    return (
      <div className="p-6 animate-pulse space-y-3">
        <div className="h-4 bg-gray-100 rounded w-40" />
        {[0, 1, 2].map((i) => <div key={i} className="h-8 bg-gray-100 rounded" />)}
      </div>
    );
  }

  // Hide widget when there's not enough real data (using_default means < 5 service records)
  if (stats?.using_default) return null;

  if (!stats || !forecast || forecast.length === 0) return null;

  // All days project zero revenue — hide silently
  const allZero = forecast.slice(0, 7).every(d => d.expected_covers === 0);
  if (allZero) return null;

  const days = forecast.slice(0, 7);
  const totalProjected = days.reduce((s, d) => s + d.expected_covers * stats.avg_spend_per_cover, 0);
  const maxProjected = Math.max(...days.map(d => d.expected_covers * stats.avg_spend_per_cover), 1);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[#111827]">
          {t('dashboard.revenueForecast')}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-deep-charcoal">{formatCurrency(totalProjected, currency)}</span>
          <span className="text-xs text-warm-stone">/ 7 {t('dashboard.days', 'days')}</span>
        </div>
      </div>

      <div className="space-y-2">
        {days.map((day) => {
          const projected = day.expected_covers * stats.avg_spend_per_cover;
          const pct = Math.round((projected / maxProjected) * 100);
          return (
            <div key={day.date} className="flex items-center gap-3">
              <span className="text-xs font-medium text-warm-stone w-8">
                {new Date(day.date + 'T12:00:00Z').toLocaleDateString(i18n.language, { weekday: 'short', timeZone: 'UTC' })}
              </span>
              <div className="flex-1 h-2 bg-soft-gray rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-400 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-deep-charcoal min-w-[64px] truncate text-right">
                {formatCurrency(projected, currency)}
              </span>
            </div>
          );
        })}
      </div>

      {/* using_default disclaimer removed — widget hidden when using defaults */}
    </div>
  );
}
