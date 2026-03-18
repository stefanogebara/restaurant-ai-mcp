import { useTranslation } from 'react-i18next';
import type { Stats } from './callTrackingTypes';

interface Props {
  stats: Stats;
}

export default function CallStatsOverview({ stats }: Props) {
  const { t } = useTranslation();
  const { overview } = stats;
  const conversionRate = overview.total_calls > 0
    ? Math.round((overview.successful_bookings / overview.total_calls) * 100)
    : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white rounded-2xl border border-border-gray p-6">
        <div className="text-xs font-medium text-muted-stone mb-2">{t('callTracking.totalCallsToday')}</div>
        <div className="text-[32px] font-bold tracking-tight leading-none text-deep-charcoal">
          {overview.total_calls}
        </div>
        <div className="text-xs text-warm-stone mt-1">{overview.successful_bookings} {t('callTracking.successfulBookings')}</div>
      </div>

      <div className="bg-white rounded-2xl border border-border-gray p-6">
        <div className="text-xs font-medium text-muted-stone mb-2">{t('callTracking.successRate')}</div>
        <div className="text-[32px] font-bold tracking-tight leading-none text-rose-600">
          {overview.success_rate}%
        </div>
        <div className="text-xs text-warm-stone mt-1">
          {t('callTracking.callsResolved', { success: overview.successful_bookings, total: overview.total_calls })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border-gray p-6">
        <div className="text-xs font-medium text-muted-stone mb-2">{t('callTracking.avgDuration')}</div>
        <div className="text-[32px] font-bold tracking-tight leading-none text-deep-charcoal">
          {overview.average_duration_formatted}
        </div>
        <div className="text-xs text-warm-stone mt-1">{t('callTracking.minutesPerCall')}</div>
      </div>

      <div className="bg-white rounded-2xl border border-border-gray p-6">
        <div className="text-xs font-medium text-muted-stone mb-2">{t('callTracking.bookingsViaCall')}</div>
        <div className="text-[32px] font-bold tracking-tight leading-none text-burgundy">
          {overview.successful_bookings}
        </div>
        <div className="text-xs text-warm-stone mt-1">
          {overview.total_calls > 0
            ? t('callTracking.conversionRate', { rate: conversionRate })
            : t('callTracking.noCallsYet')}
        </div>
      </div>
    </div>
  );
}
