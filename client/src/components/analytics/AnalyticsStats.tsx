import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/currency';

interface AnalyticsStatsProps {
  compact?: boolean;
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

export default function AnalyticsStats({ overview, reservationsByStatus, reservationsByDay, compact = false }: AnalyticsStatsProps) {
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
      tone: noShows > 0 ? 'text-red-800' : 'text-brand-ink',
    },
    {
      value: share(cancelled),
      label: t('analytics.recordedCancellationShare', 'Cancelled'),
      tone: cancelled > 0 ? 'text-amber-800' : 'text-brand-ink',
    },
    {
      value: total > 0 ? decimal(overview.avg_party_size) : '—',
      label: t('analytics.averagePartySize'),
      detail: undefined,
      tone: 'text-brand-ink',
    },
  ];

  if (compact) {
    return (
      <section aria-label={t('analytics.periodOverview', 'Period overview')} className="xl:hidden">
        <div className="grid grid-cols-2 gap-4">
          <div className="min-w-0">
            <p className="font-brand text-[42px] leading-none tracking-[-0.06em] tabular-nums text-brand-ink">{total}</p>
            <p className="mt-1 text-[12px] font-medium text-brand-muted">{t('analytics.totalReservations')}</p>
          </div>
          <div className="min-w-0 border-l border-brand-line pl-4">
            <p className="pt-1.5 font-brand text-[30px] leading-none tracking-[-0.05em] tabular-nums text-brand-ink">{recordedRevenue === undefined ? '—' : formatCurrency(recordedRevenue)}</p>
            <p className="mt-1 text-[12px] font-medium text-brand-muted">{t('analytics.recordedRevenue', 'Recorded revenue')}</p>
          </div>
        </div>
        {busiestSummary && <p className="mt-2 text-[13px] text-brand-action">{busiestSummary}</p>}
        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-brand-line pt-3">
          {supportingStats.map(stat => (
            <div key={stat.label} className="min-w-0">
              <p className={`font-brand text-[21px] leading-none tabular-nums ${stat.tone}`}>{stat.value}</p>
              <p className="mt-1 text-[12px] leading-tight text-brand-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="grid grid-cols-2 gap-x-4 gap-y-4 border-b border-brand-line pb-5 sm:gap-x-8 sm:pb-6 xl:grid-cols-1 xl:gap-y-5 xl:border-0 xl:pb-0" aria-label={t('analytics.periodOverview', 'Period overview')}>
      <div className="min-w-0">
        <p className="font-brand text-[58px] leading-[0.92] tracking-[-0.07em] tabular-nums text-brand-ink sm:text-[72px]">{total}</p>
        <p className="mt-2 text-[12px] font-medium uppercase tracking-[0.1em] text-brand-muted">{t('analytics.totalReservations')}</p>
        {busiestSummary && (
          <p className="mt-2 max-w-[26rem] font-brand text-[15px] leading-snug tracking-tight text-brand-action sm:text-[17px]">
            {busiestSummary}
          </p>
        )}
      </div>
      <div className="min-w-0 border-l border-brand-line pl-4 pt-5 sm:pl-8 sm:pt-0 xl:border-l-0 xl:border-t xl:pl-0 xl:pt-5">
        <p className="font-brand text-[31px] leading-[1.02] tracking-[-0.055em] tabular-nums text-brand-ink sm:text-[56px] xl:text-[48px]">{recordedRevenue === undefined ? '—' : formatCurrency(recordedRevenue)}</p>
        <p className="mt-2 text-[12px] font-medium uppercase tracking-[0.1em] text-brand-muted">{t('analytics.recordedRevenue', 'Recorded revenue')}</p>
        <p className="mt-2 text-[13px] leading-snug text-brand-muted">{t('analytics.recordedRevenueNote', 'Bills recorded in this period')}</p>
      </div>
      <div className="col-span-2 grid grid-cols-3 gap-x-4 gap-y-4 border-t border-brand-line pt-4 sm:gap-x-8 sm:pt-5 xl:col-span-1 xl:gap-x-3">
        {supportingStats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <p className={`font-brand text-[24px] font-normal leading-none tracking-tight tabular-nums sm:text-[28px] xl:text-[25px] ${stat.tone}`}>
              {stat.value}
            </p>
            <p className="mt-1.5 text-[12px] font-medium leading-snug text-brand-muted">
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
      <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-brand-muted">{t('analytics.currentOccupancy', 'Occupancy now')}</p>
      <p className="mt-1 text-[13px] text-muted-stone">{t('analytics.outsideSelectedPeriod', 'Live · outside the date filter')}</p>
      <p className="mt-4 font-brand text-[48px] leading-none tracking-tight tabular-nums text-brand-ink sm:text-[54px]">{displayPercentage}</p>
      {seatCount && (
        <>
          <div
            role="progressbar"
            aria-label={t('analytics.currentOccupancy', 'Occupancy now')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={meterPercentage}
            aria-valuetext={seatCount}
            className="mt-5 h-1.5 overflow-hidden rounded-full bg-brand-ink/10"
          >
            <div className="h-full rounded-full bg-brand-action" style={{ width: `${meterPercentage}%` }} />
          </div>
          <p className="mt-2 text-[13px] text-muted-stone">{seatCount}</p>
        </>
      )}
    </section>
  );
}
