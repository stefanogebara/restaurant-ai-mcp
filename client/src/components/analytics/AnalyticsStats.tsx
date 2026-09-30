import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/currency';

interface AnalyticsStatsProps {
  overview: {
    total_reservations: number;
    total_revenue?: number;
    avg_party_size: number;
    total_capacity: number;
    current_occupancy: number;
    current_occupancy_percentage: string;
  };
  reservationsByStatus: Record<string, number>;
  reservationsByDay: Record<string, number>;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export default function AnalyticsStats({ overview, reservationsByStatus, reservationsByDay }: AnalyticsStatsProps) {
  const { t, i18n } = useTranslation();
  const total = overview.total_reservations;
  const noShows = (reservationsByStatus['no-show'] ?? 0) + (reservationsByStatus.no_show ?? 0);
  const cancelled = reservationsByStatus.cancelled ?? 0;
  const decimal = (value: number) => new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
  const share = (count: number) => total > 0 ? `${decimal((count / total) * 100)}%` : '—';

  // The endpoint returns revenue from recorded bills in the selected period.
  // Its service count, by contrast, is all-time, so it cannot estimate missing
  // period revenue. Show the recorded amount only; zero means no bills recorded.
  const recordedRevenue = overview.total_revenue;
  const dayCounts = WEEKDAYS.map((day, index) => ({ day, index, count: reservationsByDay[day] ?? 0 }))
    .filter(item => Number.isFinite(item.count) && item.count > 0);
  const recordedDayTotal = dayCounts.reduce((sum, item) => sum + item.count, 0);
  const busiest = [...dayCounts].sort((a, b) => b.count - a.count)[0];
  const uniqueBusiestDay = busiest && dayCounts.filter(item => item.count === busiest.count).length === 1 ? busiest : null;
  const busiestDayName = uniqueBusiestDay && new Intl.DateTimeFormat(i18n.language, { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2024, 0, 1 + uniqueBusiestDay.index)));
  const busiestSummary = uniqueBusiestDay && busiestDayName && recordedDayTotal > 0
    ? t('analytics.busiestDaySummary', {
      day: busiestDayName,
      count: uniqueBusiestDay.count,
      share: Math.round((uniqueBusiestDay.count / recordedDayTotal) * 100),
    })
    : null;
  const supportingStats = [
    {
      value: share(noShows),
      label: t('analytics.recordedNoShowShare', 'Marked no-show'),
      tone: noShows > 0 ? 'text-red-700' : 'text-deep-charcoal',
    },
    {
      value: share(cancelled),
      label: t('analytics.recordedCancellationShare', 'Cancelled'),
      tone: cancelled > 0 ? 'text-amber-700' : 'text-deep-charcoal',
    },
    {
      value: recordedRevenue === undefined ? '—' : formatCurrency(recordedRevenue),
      label: t('analytics.recordedRevenue', 'Recorded revenue'),
      tone: 'text-deep-charcoal',
    },
    {
      value: total > 0 ? decimal(overview.avg_party_size) : '—',
      label: t('analytics.averagePartySize'),
      detail: undefined,
      tone: 'text-deep-charcoal',
    },
  ];

  return (
    <section className="grid gap-4 border-y hairline py-5 sm:gap-6 sm:py-8 lg:grid-cols-[minmax(160px,1fr)_minmax(0,4fr)] lg:gap-8" aria-label={t('analytics.periodOverview', 'Period overview')}>
      <div>
        <p className="font-serif text-[48px] leading-none tabular-nums text-deep-charcoal sm:text-[56px]">{total}</p>
        <p className="mt-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-stone">{t('analytics.totalReservations')}</p>
        {busiestSummary && (
          <p className="mt-2 max-w-[16rem] text-[13px] leading-snug text-muted-stone">
            {busiestSummary}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-t hairline pt-4 sm:gap-x-7 sm:gap-y-6 lg:grid-cols-4 lg:border-l lg:border-t-0 lg:py-1 lg:pl-8">
        {supportingStats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <p className={`font-sans text-[27px] font-normal leading-none tracking-tight tabular-nums sm:text-[29px] ${stat.tone}`}>
              {stat.value}
            </p>
            <p className="mt-2 text-[12px] font-semibold uppercase leading-snug tracking-[0.08em] text-muted-stone">
              {stat.label}
            </p>
            {stat.detail && <p className="mt-1 text-[12px] leading-snug text-muted-stone">{stat.detail}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function LiveOccupancySignal({ occupiedSeats, totalSeats }: { occupiedSeats: number; totalSeats: number }) {
  const { t, i18n } = useTranslation();
  const hasCapacity = Number.isFinite(totalSeats) && totalSeats > 0;
  const hasSeatCount = Number.isFinite(occupiedSeats) && occupiedSeats >= 0;
  const occupancyPercent = hasCapacity && hasSeatCount ? (occupiedSeats / totalSeats) * 100 : null;
  const displayPercentage = occupancyPercent !== null
    ? `${new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(occupancyPercent)}%`
    : '—';
  const seatCount = hasCapacity && hasSeatCount
    ? t('analytics.occupancySeatCount', { occupied: occupiedSeats, capacity: totalSeats })
    : null;
  const meterPercentage = occupancyPercent === null ? 0 : Math.round(Math.min(100, Math.max(0, occupancyPercent)) * 10) / 10;
  return (
    <section aria-label={t('analytics.currentOccupancy', 'Occupancy now')}>
      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-stone">{t('analytics.currentOccupancy', 'Occupancy now')}</p>
      <p className="mt-1 text-[13px] text-muted-stone">{t('analytics.outsideSelectedPeriod', 'Live · outside the date filter')}</p>
      <p className="mt-4 font-serif text-[48px] leading-none tabular-nums text-deep-charcoal sm:text-[54px]">{displayPercentage}</p>
      {seatCount && (
        <>
          <div
            role="progressbar"
            aria-label={t('analytics.currentOccupancy', 'Occupancy now')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={meterPercentage}
            aria-valuetext={seatCount}
            className="mt-5 h-1.5 overflow-hidden rounded-full bg-deep-charcoal/10"
          >
            <div className="h-full rounded-full bg-deep-charcoal" style={{ width: `${meterPercentage}%` }} />
          </div>
          <p className="mt-2 text-[13px] text-muted-stone">{seatCount}</p>
        </>
      )}
    </section>
  );
}
