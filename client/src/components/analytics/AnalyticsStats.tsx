import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/currency';

interface AnalyticsStatsProps {
  overview: {
    total_reservations: number;
    total_revenue?: number;
    avg_party_size: number;
    current_occupancy_percentage: string;
  };
  reservationsByStatus: Record<string, number>;
}

export default function AnalyticsStats({ overview, reservationsByStatus }: AnalyticsStatsProps) {
  const { t } = useTranslation();
  const total = overview.total_reservations;
  const noShows = (reservationsByStatus['no-show'] ?? 0) + (reservationsByStatus.no_show ?? 0);
  const cancelled = reservationsByStatus.cancelled ?? 0;
  const share = (count: number) => total > 0 ? `${((count / total) * 100).toFixed(1)}%` : '—';

  // The endpoint returns revenue from recorded bills in the selected period.
  // Its service count, by contrast, is all-time, so it cannot estimate missing
  // period revenue. Show the recorded amount only; zero means no bills recorded.
  const recordedRevenue = overview.total_revenue;
  const stats = [
    {
      value: total,
      label: t('analytics.totalReservations'),
      detail: undefined as string | undefined,
      tone: 'text-deep-charcoal',
    },
    {
      value: share(noShows),
      label: t('analytics.recordedNoShowShare', 'Marked no-show'),
      detail: t('analytics.statusShareNote', 'Share of reservations in this period'),
      tone: noShows > 0 ? 'text-red-700' : 'text-deep-charcoal',
    },
    {
      value: share(cancelled),
      label: t('analytics.recordedCancellationShare', 'Cancelled'),
      detail: t('analytics.statusShareNote', 'Share of reservations in this period'),
      tone: cancelled > 0 ? 'text-amber-700' : 'text-deep-charcoal',
    },
    {
      value: recordedRevenue === undefined ? '—' : formatCurrency(recordedRevenue),
      label: t('analytics.recordedRevenue', 'Recorded revenue'),
      detail: t('analytics.recordedRevenueNote', 'Bills recorded in this period'),
      tone: 'text-deep-charcoal',
    },
    {
      value: total > 0 ? overview.avg_party_size.toFixed(1) : '—',
      label: t('analytics.averagePartySize'),
      detail: undefined,
      tone: 'text-deep-charcoal',
    },
    {
      value: `${overview.current_occupancy_percentage}%`,
      label: t('analytics.currentOccupancy', 'Occupancy now'),
      detail: t('analytics.outsideSelectedPeriod', 'Live · outside the date filter'),
      tone: 'text-deep-charcoal',
    },
  ];

  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-7 sm:gap-x-8 border-y hairline py-7 sm:py-9" aria-label={t('analytics.periodOverview', 'Period overview')}>
      {stats.map((stat) => (
        <div key={stat.label}>
          <p className={`text-[29px] sm:text-[32px] leading-none tracking-[-0.035em] tabular-nums ${stat.tone}`}>
            {stat.value}
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-stone mt-3">
            {stat.label}
          </p>
          {stat.detail && <p className="text-[11px] leading-snug text-muted-stone mt-1.5">{stat.detail}</p>}
        </div>
      ))}
    </section>
  );
}
